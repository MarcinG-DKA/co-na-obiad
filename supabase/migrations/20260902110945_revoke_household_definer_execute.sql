-- Restrict SECURITY DEFINER helpers to owner/trigger. Authenticated clients
-- must not call create_household_for_user (arbitrary membership insert).
-- join_household and is_household_member keep EXECUTE for authenticated.

revoke all on function public.create_household_for_user(uuid) from public, anon, authenticated;
revoke all on function public.generate_invite_code() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
