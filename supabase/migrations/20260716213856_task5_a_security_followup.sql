-- Task 5-A post-merge security follow-up.
--
-- Helper functions are implementation details of submit_wanted_claim_signal.
-- PostgreSQL grants EXECUTE to PUBLIC by default, so revoke it explicitly on
-- all helpers, including the SECURITY DEFINER promotion function.
revoke execute on function public.wanted_claim_maybe_promote(uuid, date, boolean)
  from public, anon, authenticated;
revoke execute on function public.wanted_claim_normalize_v1(text)
  from public, anon, authenticated;
revoke execute on function public.wanted_claim_normalized_hash(text, integer)
  from public, anon, authenticated;

grant execute on function public.wanted_claim_maybe_promote(uuid, date, boolean)
  to service_role;
grant execute on function public.wanted_claim_normalize_v1(text)
  to service_role;
grant execute on function public.wanted_claim_normalized_hash(text, integer)
  to service_role;
