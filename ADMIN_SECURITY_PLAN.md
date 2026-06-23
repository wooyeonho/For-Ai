# Admin API security plan

## Current `x-admin-secret` admin APIs

| Route | Method(s) | Purpose | Mutation? |
| --- | --- | --- | --- |
| `/api/admin/candidates` | `GET`, `PATCH` | Review topic candidates and update candidate status. | `PATCH` only |
| `/api/admin/generate-candidates` | `GET`, `POST` | Inspect available AI providers and generate topic candidates. | `POST` when saving generated candidates |
| `/api/admin/promote-candidate` | `POST` | Promote an approved topic candidate into entity/document/claims/listing rows. | Yes |
| `/api/admin/verify-claim` | `GET`, `POST` | List documents/claims for verification and verify a claim with a source. | `POST` only |

## Short-term controls added

- All admin routes still require `x-admin-secret` when `ADMIN_SECRET` is configured.
- All admin routes now use per-route in-memory rate limits. Read routes allow a higher limit; mutation routes use stricter limits, and AI candidate generation is stricter because it can invoke paid providers.
- All admin mutation routes reject cross-origin browser requests when an `Origin` header is present, which gives the current header-secret workflow a basic CSRF boundary.
- Admin mutation routes write audit records with:
  - `action_type`
  - `target_id`
  - `previous_state`
  - `new_state`
  - server-side `created_at` timestamp

## Audit storage

Admin actions are stored in `admin_audit_events` rather than overloading claim-level `verification_events`, because candidate generation and promotion are not always claim-scoped. `verification_events` remains the claim-level provenance log.

## Medium-term auth plan

- Replace direct `x-admin-secret` use with Supabase Auth or a dedicated HTTP-only session cookie admin login.
- Introduce at least two roles:
  - `reviewer`: can review candidates and verify claims.
  - `admin`: can generate candidates, promote candidates, manage reviewers, and perform destructive operations.
- Add rollback/restore APIs for destructive mutations by replaying `previous_state` from `admin_audit_events` where safe.
- Keep CSRF protection on cookie-backed mutation APIs by requiring same-origin requests plus a server-issued CSRF token.
- Move rate limits to shared storage such as Redis or Supabase-backed counters before multi-instance production deployment.
