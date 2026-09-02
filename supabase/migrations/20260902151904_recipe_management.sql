-- Household recipes with nested ingredients. Reads and deletes use direct RLS;
-- nested create/update goes through save_recipe so replace-all is one transaction.

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null,
  steps text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recipes_household_id_idx on public.recipes (household_id);

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  quantity numeric,
  unit text,
  position integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recipe_id, position)
);

create index recipe_ingredients_recipe_id_idx on public.recipe_ingredients (recipe_id);
create index recipe_ingredients_household_id_idx on public.recipe_ingredients (household_id);

alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;

create policy recipes_select_authenticated
  on public.recipes
  for select
  to authenticated
  using (public.is_household_member(household_id));

create policy recipes_insert_authenticated
  on public.recipes
  for insert
  to authenticated
  with check (public.is_household_member(household_id));

create policy recipes_update_authenticated
  on public.recipes
  for update
  to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy recipes_delete_authenticated
  on public.recipes
  for delete
  to authenticated
  using (public.is_household_member(household_id));

create policy recipe_ingredients_select_authenticated
  on public.recipe_ingredients
  for select
  to authenticated
  using (public.is_household_member(household_id));

create policy recipe_ingredients_insert_authenticated
  on public.recipe_ingredients
  for insert
  to authenticated
  with check (public.is_household_member(household_id));

create policy recipe_ingredients_update_authenticated
  on public.recipe_ingredients
  for update
  to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy recipe_ingredients_delete_authenticated
  on public.recipe_ingredients
  for delete
  to authenticated
  using (public.is_household_member(household_id));

create trigger recipes_updated_at
  before update on public.recipes
  for each row
  execute function public.update_updated_at();

create trigger recipe_ingredients_updated_at
  before update on public.recipe_ingredients
  for each row
  execute function public.update_updated_at();

create or replace function public.save_recipe(
  p_household_id uuid,
  p_recipe_id uuid,
  p_title text,
  p_steps text[],
  p_ingredients jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_id uuid;
  v_household_id uuid;
  v_title text;
  v_elem jsonb;
  v_ord int;
  v_name text;
  v_unit text;
  v_quantity numeric;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_household_id is null or not public.is_household_member(p_household_id) then
    raise exception 'Not a household member';
  end if;

  v_title := trim(both from coalesce(p_title, ''));
  if v_title = '' then
    raise exception 'Title required';
  end if;

  if p_ingredients is null
     or jsonb_typeof(p_ingredients) <> 'array'
     or jsonb_array_length(p_ingredients) = 0 then
    raise exception 'Ingredients required';
  end if;

  for v_elem, v_ord in
    select elem, ord
    from jsonb_array_elements(p_ingredients) with ordinality as t(elem, ord)
  loop
    v_name := trim(both from coalesce(v_elem->>'name', ''));
    if v_name = '' then
      raise exception 'Ingredient name required';
    end if;
  end loop;

  if p_recipe_id is null then
    insert into public.recipes (household_id, title, steps)
    values (p_household_id, v_title, coalesce(p_steps, '{}'::text[]))
    returning id into v_id;
  else
    update public.recipes
    set
      title = v_title,
      steps = coalesce(p_steps, '{}'::text[])
    where id = p_recipe_id
      and household_id = p_household_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Recipe not found';
    end if;
  end if;

  select household_id into v_household_id
  from public.recipes
  where id = v_id;

  delete from public.recipe_ingredients
  where recipe_id = v_id;

  for v_elem, v_ord in
    select elem, ord
    from jsonb_array_elements(p_ingredients) with ordinality as t(elem, ord)
  loop
    v_name := trim(both from coalesce(v_elem->>'name', ''));
    v_unit := nullif(trim(both from coalesce(v_elem->>'unit', '')), '');

    if jsonb_typeof(v_elem->'quantity') in ('number', 'string')
       and coalesce(v_elem->>'quantity', '') not in ('', 'null') then
      v_quantity := (v_elem->>'quantity')::numeric;
    else
      v_quantity := null;
    end if;

    insert into public.recipe_ingredients (
      recipe_id,
      household_id,
      name,
      quantity,
      unit,
      position
    )
    values (
      v_id,
      v_household_id,
      v_name,
      v_quantity,
      v_unit,
      (v_ord - 1)::int
    );
  end loop;

  return v_id;
end;
$$;

revoke all on function public.save_recipe(uuid, uuid, text, text[], jsonb) from public;
revoke all on function public.save_recipe(uuid, uuid, text, text[], jsonb) from anon;
grant execute on function public.save_recipe(uuid, uuid, text, text[], jsonb) to authenticated;
