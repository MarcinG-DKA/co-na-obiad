-- Household model + RLS isolation. Writes go through definer functions/triggers,
-- not through authenticated INSERT/UPDATE/DELETE policies.

create or replace function public.generate_invite_code()
returns text
language sql
volatile
as $$
  select replace(gen_random_uuid()::text, '-', '');
$$;

create table public.households (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index household_members_user_id_idx on public.household_members (user_id);

alter table public.households enable row level security;
alter table public.household_members enable row level security;

-- Bypass RLS so policies on household_members can test membership without recursion.
create or replace function public.is_household_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = p_household_id
      and user_id = auth.uid()
  );
$$;

revoke all on function public.is_household_member(uuid) from public;
grant execute on function public.is_household_member(uuid) to authenticated;

create policy households_select_authenticated
  on public.households
  for select
  to authenticated
  using (public.is_household_member(id));

create policy household_members_select_authenticated
  on public.household_members
  for select
  to authenticated
  using (public.is_household_member(household_id));

create or replace function public.create_household_for_user(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_household_id uuid;
  new_code text;
begin
  loop
    new_code := public.generate_invite_code();
    begin
      insert into public.households (invite_code)
      values (new_code)
      returning id into new_household_id;
      exit;
    exception
      when unique_violation then
        -- invite_code collision; retry
        null;
    end;
  end loop;

  insert into public.household_members (household_id, user_id)
  values (new_household_id, p_user_id);

  return new_household_id;
end;
$$;

revoke all on function public.create_household_for_user(uuid) from public;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.create_household_for_user(new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Backfill Auth users created before this migration.
do $$
declare
  r record;
begin
  for r in
    select u.id
    from auth.users u
    where not exists (
      select 1
      from public.household_members m
      where m.user_id = u.id
    )
  loop
    perform public.create_household_for_user(r.id);
  end loop;
end;
$$;

create or replace function public.join_household(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select id into hid
  from public.households
  where invite_code = p_code;

  if hid is null then
    raise exception 'Unknown invite code';
  end if;

  insert into public.household_members (household_id, user_id)
  values (hid, uid)
  on conflict (household_id, user_id) do nothing;

  return hid;
end;
$$;

revoke all on function public.join_household(text) from public;
grant execute on function public.join_household(text) to authenticated;
