\set ON_ERROR_STOP on
\pset pager off

-- Three users: two parents in one family, plus an outsider.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'parent.a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'parent.b@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'stranger@example.com');

-- A non-superuser role, because RLS is bypassed by the table owner.
--
-- It is a MEMBER of `authenticated` rather than being granted tables directly:
-- the privileges under test then are exactly the ones the migrations hand out,
-- so a dropped GRANT fails here instead of in production.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user nologin;
  end if;
end $$;
grant usage on schema public, auth to app_user;
grant authenticated to app_user;
grant execute on function auth.uid() to app_user;
-- Supabase gives `anon` these two by default; a bare container does not.
grant usage on schema public, auth to anon;
grant execute on function auth.uid() to anon;

\echo '--- Parent A creates a family ---'
set role app_user;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select * from public.create_family('Ada') \gset fam_
\echo family=:fam_family_id baby=:fam_baby_id code=:fam_invite_code

\echo '--- A logs a nursing feed ---'
insert into public.care_events
  (id, family_id, baby_id, kind, started_at, ended_at,
   last_side, left_seconds, right_seconds, created_by, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', :'fam_family_id', :'fam_baby_id',
   'nursing', now() - interval '20 min', now() - interval '5 min',
   'left', 600, 300, '11111111-1111-1111-1111-111111111111',
   now() - interval '5 min');
do $$ begin
  if (select count(*) from public.care_events) <> 1 then
    raise exception 'A should see exactly 1 event';
  end if;
end $$;

\echo '--- Stranger sees NOTHING (RLS) ---'
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$ begin
  if (select count(*) from public.care_events) <> 0 then
    raise exception 'stranger can see care_events';
  end if;
  if (select count(*) from public.families) <> 0 then
    raise exception 'stranger can see families';
  end if;
end $$;

\echo '--- Stranger cannot guess their way in by family_id ---'
do $$ begin
  if (select count(*) from public.care_events
      where family_id = (select id from public.families
                          where invite_code is not null limit 1)) <> 0 then
    raise exception 'stranger reached events by targeting a family_id';
  end if;
end $$;

\echo '--- Parent B joins with the invite code ---'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select * from public.join_family(:'fam_invite_code') \gset join_
do $$ begin
  if (select count(*) from public.care_events) <> 1 then
    raise exception 'B joined but cannot see the family event';
  end if;
end $$;

\echo '--- A bad code is rejected ---'
do $$ begin
  perform public.join_family('BADCODE1');
  raise exception 'SHOULD NOT REACH: bad code was accepted';
exception when no_data_found then
  raise notice 'bad invite code correctly rejected';
end $$;

\echo '--- A member cannot start a second family (the old lockout) ---'
do $$ begin
  perform public.create_family('Second');
  raise exception 'SHOULD NOT REACH: member created a second family';
exception when sqlstate 'P0003' then
  raise notice 'second family correctly refused';
end $$;

\echo '--- Re-joining the family you are already in stays idempotent ---'
do $$ declare n int; begin
  perform public.join_family((select invite_code from public.families limit 1));
  select count(*) into n from public.family_members
    where user_id = '22222222-2222-2222-2222-222222222222';
  if n <> 1 then raise exception 'rejoin duplicated the membership row'; end if;
end $$;

\echo '--- Last-writer-wins: a stale offline write must NOT clobber ---'
-- B (online, newer clock) corrects the feed.
update public.care_events
  set right_seconds = 999, updated_at = now()
  where id = 'aaaaaaaa-0000-4000-8000-000000000001';
-- A reconnects and pushes an edit made while offline an hour ago.
update public.care_events
  set right_seconds = 111, updated_at = now() - interval '1 hour'
  where id = 'aaaaaaaa-0000-4000-8000-000000000001';
do $$ begin
  if (select right_seconds from public.care_events
      where id = 'aaaaaaaa-0000-4000-8000-000000000001') <> 999 then
    raise exception 'a stale write clobbered a newer one';
  end if;
end $$;

\echo '--- A newer write DOES win ---'
update public.care_events
  set right_seconds = 555, updated_at = now() + interval '1 min'
  where id = 'aaaaaaaa-0000-4000-8000-000000000001';
do $$ begin
  if (select right_seconds from public.care_events
      where id = 'aaaaaaaa-0000-4000-8000-000000000001') <> 555 then
    raise exception 'a newer write was rejected';
  end if;
end $$;

\echo '--- Soft delete replicates as a tombstone, not a vanished row ---'
update public.care_events set deleted_at = now(), updated_at = now() + interval '2 min'
  where id = 'aaaaaaaa-0000-4000-8000-000000000001';
do $$ begin
  if not (select deleted_at is not null from public.care_events
          where id = 'aaaaaaaa-0000-4000-8000-000000000001') then
    raise exception 'soft delete did not leave a tombstone';
  end if;
end $$;

\echo '--- kind_shape rejects a malformed event ---'
do $$ begin
  insert into public.care_events (id, family_id, baby_id, kind, started_at, updated_at)
  values (gen_random_uuid(),
          (select family_id from public.family_members
            where user_id = '22222222-2222-2222-2222-222222222222' limit 1),
          (select id from public.babies limit 1),
          'bottle', now(), now());   -- bottle with no amount_ml
  raise exception 'SHOULD NOT REACH: malformed bottle accepted';
exception when check_violation then
  raise notice 'malformed bottle event correctly rejected';
end $$;

\echo '--- Cursor advances on the server clock, independent of client clock ---'
do $$ begin
  if not (select server_updated_at > updated_at - interval '5 min'
          from public.care_events
          where id = 'aaaaaaaa-0000-4000-8000-000000000001') then
    raise exception 'server_updated_at was not server-stamped';
  end if;
end $$;

\echo '--- Leaving a family that still has members keeps the family ---'
do $$ begin
  if public.leave_family() <> false then
    raise exception 'B was not the last member, yet the family was deleted';
  end if;
  if (select count(*) from public.care_events) <> 0 then
    raise exception 'B still sees the family events after leaving';
  end if;
end $$;

\echo '--- ...and B can join again afterwards ---'
select * from public.join_family(:'fam_invite_code') \gset rejoin_
do $$ begin
  if (select count(*) from public.care_events) <> 1 then
    raise exception 'B could not rejoin after leaving';
  end if;
end $$;

\echo '--- The last member out deletes the family, freeing the event ids ---'
do $$ begin
  if public.leave_family() <> false then
    raise exception 'B leaving deleted a family A is still in';
  end if;
end $$;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$ begin
  if public.leave_family() <> true then
    raise exception 'the last member out did not delete the family';
  end if;
end $$;

reset role;
do $$ begin
  if (select count(*) from public.families) <> 0 then
    raise exception 'the emptied family was not removed';
  end if;
  -- The cascade is what frees client-generated ids for re-adoption.
  if (select count(*) from public.care_events) <> 0 then
    raise exception 'care_events survived their family';
  end if;
  if (select count(*) from public.babies) <> 0 then
    raise exception 'babies survived their family';
  end if;
end $$;

\echo '--- Anyone can send feedback; nobody can read it through the API ---'
-- Clear the claim: a real anon JWT has no sub, and the setting outlives role switches.
set request.jwt.claim.sub = '';
set role anon;
select public.submit_feedback('anonymous note', '  ', 'he');
do $$ begin
  begin
    perform public.submit_feedback('   ');
    raise exception 'blank feedback was accepted';
  exception when others then
    if sqlerrm <> 'empty message' then raise; end if;
  end;
  begin
    perform public.submit_feedback(repeat('x', 2001));
    raise exception 'a 2001-char message was accepted';
  exception when check_violation then null;
  end;
  begin
    perform count(*) from public.feedback;
    raise exception 'anon can read feedback';
  exception when insufficient_privilege then null;
  end;
end $$;
set role app_user;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select public.submit_feedback('signed-in note', 'parent.a@example.com', 'en');
do $$ begin
  begin
    perform count(*) from public.feedback;
    raise exception 'a signed-in user can read feedback';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.feedback) <> 2 then
    raise exception 'expected 2 feedback rows';
  end if;
  if (select user_id from public.feedback where message = 'anonymous note') is not null then
    raise exception 'anonymous feedback carries a user id';
  end if;
  if (select email from public.feedback where message = 'anonymous note') is not null then
    raise exception 'a blank email was stored instead of null';
  end if;
  if (select user_id from public.feedback where message = 'signed-in note')
     <> '11111111-1111-1111-1111-111111111111' then
    raise exception 'signed-in feedback lost its user id';
  end if;
end $$;

\echo '--- All assertions passed ---'
