-- Trigger helper is INVOKER, not DEFINER, but keep grant hygiene consistent with F-01.
revoke all on function public.update_updated_at() from public;
revoke all on function public.update_updated_at() from anon;
revoke all on function public.update_updated_at() from authenticated;
