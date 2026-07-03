# Emergency ADMIN_SECRET Rotation

Use this runbook only when Supabase Auth admin access is unavailable and an emergency administrative action is required. `ADMIN_SECRET` is a break-glass fallback, not the normal production admin login path.

## Default production policy

- In production, `ADMIN_SECRET` fallback authentication is disabled by default.
- Enable it only by setting `ALLOW_BREAK_GLASS_ADMIN=true` for the shortest possible maintenance window.
- Every break-glass admin request must be traceable in `admin_audit_events` through `metadata.break_glass: true` or a dedicated break-glass action such as `admin.login` with break-glass metadata.
- Browser-originated `x-admin-secret` requests remain forbidden; browser access can only use the short-lived httpOnly session issued by the login route while break-glass is enabled.

## Rotation procedure

1. Generate a new high-entropy `ADMIN_SECRET` and store it in the approved secret manager.
2. Deploy the new `ADMIN_SECRET` with `ALLOW_BREAK_GLASS_ADMIN=true` only if emergency fallback access is required immediately.
3. Verify that `/api/admin/login` returns the production disabled warning when `ALLOW_BREAK_GLASS_ADMIN` is not set to `true`.
4. If break-glass access is required, sign in through `/api/admin/login` and perform only the emergency action needed to restore normal Supabase Auth admin access.
5. Query `admin_audit_events` for `metadata->>'break_glass' = 'true'` and confirm the actor, action, target, and timestamp are expected.
6. Remove `ALLOW_BREAK_GLASS_ADMIN` or set it to `false` immediately after the emergency is resolved, then redeploy/restart the service.
7. Rotate `ADMIN_SECRET` again after the incident if it was shared with any human operator or exposed in logs, chat, tickets, terminals, or screenshots.
8. Record the incident summary, audit event IDs, rotation timestamps, and follow-up actions in the operations log.

## Post-rotation checks

- Confirm normal Supabase Auth admin authorization works with a bearer token for a row in `admin_users`.
- Confirm CLI/internal `x-admin-secret` access is rejected in production after `ALLOW_BREAK_GLASS_ADMIN` is disabled.
- Confirm `/api/admin/login` returns `admin_secret_login_disabled` in production when break-glass is disabled.
- Confirm no raw IP addresses or raw user-agent strings were stored; audit metadata should contain hashes only.
