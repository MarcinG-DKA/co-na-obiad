-- Restrict pantry and recipe ingredient units to ml, g, or pcs.

update public.pantry_items
set unit = nullif(lower(trim(both from unit)), '')
where unit is not null;

update public.pantry_items
set unit = null
where unit is not null
  and unit not in ('ml', 'g', 'pcs');

update public.recipe_ingredients
set unit = nullif(lower(trim(both from unit)), '')
where unit is not null;

update public.recipe_ingredients
set unit = null
where unit is not null
  and unit not in ('ml', 'g', 'pcs');

alter table public.pantry_items
  add constraint pantry_items_unit_check
  check (unit is null or unit in ('ml', 'g', 'pcs'));

alter table public.recipe_ingredients
  add constraint recipe_ingredients_unit_check
  check (unit is null or unit in ('ml', 'g', 'pcs'));

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
    v_unit := nullif(lower(trim(both from coalesce(v_elem->>'unit', ''))), '');
    if v_unit is not null and v_unit not in ('ml', 'g', 'pcs') then
      raise exception 'Invalid unit';
    end if;

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
