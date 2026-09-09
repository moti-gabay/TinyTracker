-- One family per user, and a way out of the wrong one.
--
-- The failure this fixes: the join screen offered "Start a new family" as its
-- primary action, create_family had no membership guard, and once a row in
-- `families` was visible the client showed only that family's code -- with no
-- join input and no way to leave. A partner who tapped the obvious button was
-- then permanently unable to join the family they were invited to.
--
-- The guard belongs here rather than in the client because both RPCs are
-- SECURITY DEFINER: they succeed even when the caller cannot select from
-- `families` at all, so a client-side check is not a check.

-- ---------------------------------------------------------- create_family --

create or replace function public.create_family(baby_name text default 'Baby')
returns table (family_id uuid, baby_id uuid, invite_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  code text;
  fid uuid;
  bid uuid;
  tries int := 0;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if exists (select 1 from public.family_members m where m.user_id = uid) then
    raise exception 'already in a family' using errcode = 'P0003';
  end if;

  loop
    code := public.generate_invite_code();
    exit when not exists (select 1 from public.families f where f.invite_code = code);
    tries := tries + 1;
    if tries > 10 then
      raise exception 'could not allocate an invite code';
    end if;
  end loop;

  insert into public.families (invite_code, created_by)
  values (code, uid)
  returning id into fid;

  insert into public.family_members (family_id, user_id, role)
  values (fid, uid, 'parent');

  insert into public.babies (family_id, name)
  values (fid, coalesce(nullif(trim(baby_name), ''), 'Baby'))
  returning id into bid;

  return query select fid, bid, code;
end;
$$;

-- ------------------------------------------------------------ join_family --
-- Unchanged except for the guard. Re-joining the family you are already in
-- stays idempotent: the client calls this on every mount after a join.

create or replace function public.join_family(code text)
returns table (family_id uuid, baby_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  fid uuid;
  bid uuid;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select f.id into fid
  from public.families f
  where f.invite_code = upper(trim(code));

  if fid is null then
    raise exception 'invalid invite code' using errcode = 'no_data_found';
  end if;

  if exists (
    select 1 from public.family_members m
    where m.user_id = uid and m.family_id <> fid
  ) then
    raise exception 'already in a family' using errcode = 'P0003';
  end if;

  insert into public.family_members (family_id, user_id, role)
  values (fid, uid, 'parent')
  on conflict do nothing;

  select b.id into bid
  from public.babies b
  where b.family_id = fid
  order by b.created_at
  limit 1;

  return query select fid, bid;
end;
$$;

-- ----------------------------------------------------------- leave_family --
-- Returns true when the caller was the last member and the family was removed.
--
-- Deleting the emptied family is not tidiness: care_events ids are client
-- generated and stable, so a device carrying locally-logged events into its
-- real family re-pushes those same ids. If the abandoned family still held
-- them, that push would be an UPDATE on rows the caller can no longer see and
-- RLS would reject it -- every carried log dead-lettered. Removing the empty
-- family frees the ids. A family that still has members keeps its rows, and
-- the client clears its local copy instead.

create or replace function public.leave_family()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  fid uuid;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  delete from public.family_members m
  where m.user_id = uid
  returning m.family_id into fid;

  if fid is null then
    return false;
  end if;

  if exists (select 1 from public.family_members m where m.family_id = fid) then
    return false;
  end if;

  delete from public.families where id = fid;   -- cascades babies + care_events
  return true;
end;
$$;

-- ---------------------------------------------------------------- grants --
-- Re-applied verbatim from 0001 so a single run of this file leaves a live
-- project correct, whatever state its default privileges were in.

grant execute on function public.leave_family() to authenticated;

grant select, update                 on public.profiles        to authenticated;
grant select                         on public.families        to authenticated;
grant select, delete                 on public.family_members  to authenticated;
grant select, insert, update, delete on public.babies          to authenticated;
grant select, insert, update         on public.care_events     to authenticated;
grant select, insert, update, delete on public.active_sessions to authenticated;
