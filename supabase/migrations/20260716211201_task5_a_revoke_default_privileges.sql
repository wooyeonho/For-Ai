-- Production history reconciliation for Task 5-A.
--
-- New public tables inherited browser-role grants from project defaults.
-- RLS protects row DML, but TRUNCATE bypasses RLS, so remove every direct
-- browser-role privilege from the private Task 5-A tables.
revoke all on contributors, wanted_claims, wanted_claim_demand_signals, wanted_claim_suggesters
  from anon, authenticated;
