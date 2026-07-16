# Production least-privilege recovery

## Why this was required

The Task 5-0 live-schema audit found that effective production grants did not
match the repository's intended least-privilege contract. The recovery narrows
browser-role access to internal RPCs and canonical write surfaces, and aligns
the repository migration filenames with production migration history.

## Recovery applied

The production database received these migrations:

| Version | Name | Result |
| --- | --- | --- |
| 20260716124542 | rate_limit_counters | Distributed limiter table/RPC present |
| 20260716210327 | least_privilege_recovery | Internal RPC and canonical write privileges narrowed |

The repository migration filenames for Task 4, Task 5-0, and the rate limiter
were aligned to the versions recorded in production migration history. No SQL
body or application behavior was changed by those renames.

## Live verification

After applying the recovery, a live verification confirmed:

- Task 5 remained at phase 0; draft_enabled remained false.
- Internal RPC access is restricted to the server-side service role.
- Canonical fact, audit, and rate-limit writes are unavailable to browser roles.
- Browser roles have no TRUNCATE privilege on public tables.
- A rolled-back call to increment_rate_limit while running as service_role
  returned count 1 and limited false.
- The public read-only get_claim_status_transition_events RPC intentionally
  remains executable by anon/authenticated for the public feeds.

The remaining Supabase advisor notices are either INFO for intentionally
server-only RLS tables with no public policy or pre-existing permissive-policy
findings that require separate, caller-by-caller review.

## Rollback

Do not broadly restore the previous grants. If a specific browser-facing caller
is proven to require a privilege, add the narrowest table/function grant and
matching RLS policy in a new forward migration.
