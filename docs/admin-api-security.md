# Admin API security plan

## Current `x-admin-secret` admin API inventory

| Route | Methods | Purpose | Mutation | Audit action type |
| --- | --- | --- | --- | --- |
| `/api/admin/candidates` | `GET` | List topic candidates by status. | No | `candidates.list` |
| `/api/admin/candidates` | `PATCH` | Change a topic candidate review status. | Yes | `candidates.update_status` |
| `/api/admin/generate-candidates` | `GET` | Show configured AI providers and supported languages. | No | Not persisted |
| `/api/admin/generate-candidates` | `POST` | Generate topic candidates and optionally save them. | Yes, when `save !== false` | `generate_candidates.create` |
| `/api/admin/promote-candidate` | `POST` | Promote an approved topic candidate into an entity, document, listing, and claims. | Yes | `promote_candidate.create_document` |
| `/api/admin/verify-claim` | `GET` | List documents with claims and sources for verification review. | No | Not persisted |
| `/api/admin/verify-claim` | `POST` | Add a claim source and mark a claim as verified. | Yes | `verify_claim.verify` |

## Short-term controls

- All admin API routes continue to require `x-admin-secret` while the MVP remains lightweight.
- All admin API routes share an in-process rate limiter keyed by forwarded client address and the admin secret prefix.
- Admin mutation APIs apply a CSRF strategy:
  - same-origin `Origin` validation when the browser sends an `Origin` header;
  - optional `x-admin-csrf` enforcement when `ADMIN_CSRF_SECRET` is configured.
- Admin mutations write `admin_audit_logs` rows through the service-role Supabase client.
- Audit rows include `action_type`, `target_table`, `target_id`, `previous_state`, `new_state`, and `created_at`.

## Medium-term authentication target

- Replace shared-secret admin access with either Supabase Auth or a separate session-cookie admin login.
- Introduce at least two admin roles:
  - `reviewer`: can review candidates and verify claims.
  - `admin`: can promote candidates, manage reviewers, and run destructive/rollback actions.
- Keep public submissions login-free; admin auth must not become public edit auth.

## Destructive action and rollback design

- Every destructive mutation must record a complete `previous_state` in `admin_audit_logs` before changing data.
- Add rollback endpoints that restore from a specific audit log row rather than accepting arbitrary client-provided state.
- Restrict rollback endpoints to the `admin` role after session-based auth exists.
- Rollback APIs should create their own audit row with the rollback action type and both before/after states.
