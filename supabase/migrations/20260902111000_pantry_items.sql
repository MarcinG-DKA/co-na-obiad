-- Pantry items scoped to households. Direct RLS policies for all CRUD operations;
-- no definer RPCs needed for standard pantry management.

create table public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  quantity numeric,
  unit text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pantry_items_household_id_idx on public.pantry_items (household_id);

alter table public.pantry_items enable row level security;

create policy pantry_items_select_authenticated
  on public.pantry_items
  for select
  to authenticated
  using (public.is_household_member(household_id));

create policy pantry_items_insert_authenticated
  on public.pantry_items
  for insert
  to authenticated
  with check (public.is_household_member(household_id));

create policy pantry_items_update_authenticated
  on public.pantry_items
  for update
  to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy pantry_items_delete_authenticated
  on public.pantry_items
  for delete
  to authenticated
  using (public.is_household_member(household_id));

-- Generic trigger function for auto-updating updated_at; reusable by future tables.
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger pantry_items_updated_at
  before update on public.pantry_items
  for each row
  execute function public.update_updated_at();
