# Environment setup

A human must create the Supabase project, run `schema-v3.sql`, and provide secrets. AI agents must not invent secret values.

## Required variables

| Variable | Required for | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public submissions, admin DB access, runtime data | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public insert flows when service role is absent | Must rely on RLS from `schema-v3.sql`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin routes and privileged server writes | Server-only. Never expose in client code. |
| `CONTRIBUTOR_SALT` | Public submissions and topic suggestions | Missing value causes public submission APIs to fail with 500 because contributor hashes cannot be generated. |
| `ADMIN_SECRET` | Admin APIs/pages | Must be non-empty in every deployed environment. Empty admin secrets must deny, not allow. |
| `ADMIN_CSRF_SECRET` | Stronger admin write protection | Optional in code, recommended in production. |

## Human checklist

1. Create a Supabase project.
2. Execute `schema-v3.sql` in Supabase SQL editor.
3. Add the variables above to `.env.local` for local testing.
4. Add the same variables to the deployment provider's secret store.
5. Restart the Next.js server after changing variables.
6. Run the functional audit in `FUNCTIONAL_AUDIT.md`.

## Expected failure signatures

- Public forms return `500` with `Server configuration error`: check `CONTRIBUTOR_SALT`.
- Admin routes return `500` with Supabase config errors: check `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- Admin routes accept empty/absent secrets: fix the route before deployment.
- Submitted forms say success but data is not in Supabase: identify stub fallback and replace the message with an honest pending/unconfigured state or durable insert.
