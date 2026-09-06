-- TinyTracker initial schema.
--
-- Design notes:
--  * One `care_events` table with a `kind` discriminator, not four tables.
--    The offline sync engine then needs exactly one outbox, one pull cursor,
--    one realtime channel and one conflict rule.
--  * `updated_at` is the CLIENT clock and is the sole input to last-writer-wins.
--    `server_updated_at` is the SERVER clock and is used only as the pull
--    cursor, so client clock skew can never cause a device to miss a row.
--  * Deletes are soft. A tombstone replicates; a hard delete would silently
--    reappear on a peer that was offline during the delete.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- profiles --

create table public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

-- --------------------------------------------------------------- families --

create table public.families (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Our family',
  invite_code text not null unique,
  created_by  uuid not null references public.profiles on delete cascade,
  created_at  timestamptz not null default now()
);

create table public.family_members (
  family_id uuid not null references public.families on delete cascade,
  user_id   uuid not null references public.profiles on delete cascade,
  role      text not null default 'parent' check (role in ('parent', 'caregiver')),
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id)
);

create index family_members_user on public.family_members (user_id);

create table public.babies (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references public.families on delete cascade,
  name       text not null default 'Baby',
  born_at    date,
  created_at timestamptz not null default now()
);

create index babies_family on public.babies (family_id);

-- ------------------------------------------------------------ care_events --

create table public.care_events (
  id                uuid primary key,   -- client-generated: upserts are idempotent
  family_id         uuid not null references public.families on delete cascade,
  baby_id           uuid not null references public.babies on delete cascade,
  kind              text not null check (kind in ('nursing', 'bottle', 'pump', 'diaper')),

  started_at        timestamptz not null,
  ended_at          timestamptz,

  last_side         text check (last_side in ('left', 'right')),
  left_seconds      int check (left_seconds >= 0),
  right_seconds     int check (right_seconds >= 0),

  amount_ml         numeric(7, 1) check (amount_ml >= 0),
  bottle_content    text check (bottle_content in ('formula', 'breast_milk', 'mixed')),

  left_ml           numeric(7, 1) check (left_ml >= 0),
  right_ml          numeric(7, 1) check (right_ml >= 0),

  diaper_type       text check (diaper_type in ('wet', 'dirty', 'both')),

  note              text,
  created_by        uuid references public.profiles on delete set null,

  updated_at        timestamptz not null,
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz,

  constraint kind_shape check (
    (kind = 'nursing' and last_side is not null
                      and left_seconds is not null
                      and right_seconds is not null) or
    (kind = 'bottle'  and amount_ml is not null) or
    (kind = 'pump'    and (left_ml is not null or right_ml is not null)) or
    (kind = 'diaper'  and diaper_type is not null)
  )
);

create index care_events_family_started
  on public.care_events (family_id, started_at desc);
create index care_events_family_cursor
  on public.care_events (family_id, server_updated_at);

-- ------------------------------------------------------- active_sessions --
-- A feed in progress, so the partner's phone can show "feeding now".
-- One row per family: a newborn is not fed on two breasts by two people.

create table public.active_sessions (
  family_id  uuid primary key references public.families on delete cascade,
  baby_id    uuid not null references public.babies on delete cascade,
  session_id uuid not null,
  side       text not null check (side in ('left', 'right')),
  started_at timestamptz not null,
  paused_at  timestamptz,
  paused_ms  int not null default 0,
  updated_by uuid references public.profiles on delete set null,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------- functions --

-- Membership test used by every RLS policy. SECURITY DEFINER so the policy on
-- family_members does not recurse into itself.
create or replace function public.is_family_member(fid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.family_members
    where family_id = fid and user_id = auth.uid()
  );
$$;

-- Mirror auth.users into profiles on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name',
                           split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Stamp the server clock and enforce last-writer-wins.
-- A client that was offline may push a row older than one a peer already
-- pushed; without this the stale write would win simply by arriving later.
create or replace function public.care_events_before_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return old;   -- keep what we have; the incoming write is stale
  end if;
  new.server_updated_at := now();
  return new;
end;
$$;

drop trigger if exists care_events_bw on public.care_events;
create trigger care_events_bw
  before insert or update on public.care_events
  for each row execute function public.care_events_before_write();

-- Unambiguous invite alphabet: no 0/O/1/I/L to survive being read aloud
-- across a dark room at 3 AM.
create or replace function public.generate_invite_code()
returns text
language plpgsql
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  result text := '';
  i int;
begin
  for i in 1..8 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

-- Create a family, its first baby, and the caller's membership, atomically.
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

-- Join by code. SECURITY DEFINER so a user can resolve a code WITHOUT being
-- able to select from families -- the code is the only key, and it is never
-- enumerable through the table itself.
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

-- ------------------------------------------------------------------ RLS --

alter table public.profiles       enable row level security;
alter table public.families       enable row level security;
alter table public.family_members enable row level security;
alter table public.babies         enable row level security;
alter table public.care_events    enable row level security;
alter table public.active_sessions enable row level security;

create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Families are readable only by members. Creation goes through create_family.
create policy families_select_member on public.families
  for select using (public.is_family_member(id));

create policy family_members_select on public.family_members
  for select using (public.is_family_member(family_id));
create policy family_members_delete_self on public.family_members
  for delete using (user_id = auth.uid());

create policy babies_all_member on public.babies
  for all using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

create policy care_events_select on public.care_events
  for select using (public.is_family_member(family_id));
create policy care_events_insert on public.care_events
  for insert with check (
    public.is_family_member(family_id)
    and (created_by is null or created_by = auth.uid())
  );
-- Either parent may correct any of the family's logs.
create policy care_events_update on public.care_events
  for update using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

create policy active_sessions_all on public.active_sessions
  for all using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

-- --------------------------------------------------------------- realtime --

alter publication supabase_realtime add table public.care_events;
alter publication supabase_realtime add table public.active_sessions;
