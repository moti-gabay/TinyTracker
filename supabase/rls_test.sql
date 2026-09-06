\set ON_ERROR_STOP on
\pset pager off

-- Three users: two parents in one family, plus an outsider.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'parent.a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'parent.b@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'stranger@example.com');

-- A non-superuser role, because RLS is bypassed by the table owner.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user nologin;
  end if;
end $$;
grant usage on schema public, auth to app_user;
grant select, insert, update, delete on all tables in schema public to app_user;
grant execute on all functions in schema public to app_user;
grant execute on function auth.uid() to app_user;

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
select count(*) as a_sees from public.care_events;

\echo '--- Stranger sees NOTHING (RLS) ---'
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select count(*) as stranger_sees_events from public.care_events;
select count(*) as stranger_sees_families from public.families;

\echo '--- Stranger cannot guess their way in by family_id ---'
select count(*) as stranger_targeted from public.care_events
  where family_id = :'fam_family_id';

\echo '--- Parent B joins with the invite code ---'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select * from public.join_family(:'fam_invite_code') \gset join_
select count(*) as b_sees_events from public.care_events;

\echo '--- A bad code is rejected ---'
do $$ begin
  perform public.join_family('BADCODE1');
  raise exception 'SHOULD NOT REACH: bad code was accepted';
exception when no_data_found then
  raise notice 'bad invite code correctly rejected';
end $$;

\echo '--- Last-writer-wins: a stale offline write must NOT clobber ---'
-- B (online, newer clock) corrects the feed.
update public.care_events
  set right_seconds = 999, updated_at = now()
  where id = 'aaaaaaaa-0000-4000-8000-000000000001';
select right_seconds as after_b_fresh_write from public.care_events
  where id = 'aaaaaaaa-0000-4000-8000-000000000001';

-- A reconnects and pushes an edit made while offline an hour ago.
update public.care_events
  set right_seconds = 111, updated_at = now() - interval '1 hour'
  where id = 'aaaaaaaa-0000-4000-8000-000000000001';
select right_seconds as after_stale_write_rejected from public.care_events
  where id = 'aaaaaaaa-0000-4000-8000-000000000001';

\echo '--- A newer write DOES win ---'
update public.care_events
  set right_seconds = 555, updated_at = now() + interval '1 min'
  where id = 'aaaaaaaa-0000-4000-8000-000000000001';
select right_seconds as after_newer_write from public.care_events
  where id = 'aaaaaaaa-0000-4000-8000-000000000001';

\echo '--- Soft delete replicates as a tombstone, not a vanished row ---'
update public.care_events set deleted_at = now(), updated_at = now() + interval '2 min'
  where id = 'aaaaaaaa-0000-4000-8000-000000000001';
select (deleted_at is not null) as is_tombstoned from public.care_events
  where id = 'aaaaaaaa-0000-4000-8000-000000000001';

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
select (server_updated_at > updated_at - interval '5 min') as cursor_is_server_stamped
from public.care_events where id = 'aaaaaaaa-0000-4000-8000-000000000001';

reset role;
