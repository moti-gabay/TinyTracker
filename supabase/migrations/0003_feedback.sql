-- In-app feedback.
--
-- The table has no policies and no table grants on purpose: the API can
-- neither read nor write it. The only way in is submit_feedback(), which is
-- SECURITY DEFINER like the family RPCs, and the only way out is the
-- dashboard. Granted to `anon` as well, because the app works without
-- sign-in and a feedback form that first demands an account gets no feedback.

create table public.feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users (id) on delete set null,
  email      text check (email is null or length(email) <= 254),
  message    text not null check (length(message) between 1 and 2000),
  lang       text,
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

create or replace function public.submit_feedback(
  message text,
  email text default null,
  lang text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if message is null or length(trim(message)) = 0 then
    raise exception 'empty message';
  end if;
  insert into public.feedback (user_id, email, message, lang)
  values (auth.uid(), nullif(trim(email), ''), trim(message), lang);
end;
$$;

grant execute on function public.submit_feedback(text, text, text) to anon, authenticated;
