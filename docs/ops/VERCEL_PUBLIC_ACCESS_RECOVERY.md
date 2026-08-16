# For-AI Vercel Public Access Recovery

Status: **operator runbook / no Vercel setting changed by this branch**  
Tracked by: #505

## Objective

Restore anonymous public access to the single canonical For-AI production project without weakening preview/testing security unnecessarily and without changing the wrong Vercel project.

## Known state

Repository records identify `for-ai-e4mm` as the intended canonical production project and also record a duplicate `for-ai` Vercel project. Historical GitHub/Vercel checks show both project records existed and deployed independently.

As of 2026-08-15, the Vercel connector available to the operator cannot read either known project through the project/log APIs (403/404), so it is not safe to mutate deployment protection remotely from this environment.

## Safety rule

**Never run a protection-disable command until the active Vercel account/team and target project are visibly verified.**

Deployment Protection is a security control. A successful preview deployment is not proof that the intended production site is anonymously public.

## Step 1 — establish the exact account and canonical project

From a terminal/browser authenticated to the Vercel account that owns For-AI:

```bash
vercel whoami
vercel teams ls
```

Then inspect the candidate projects in the dashboard or with the project CLI. Do not rely only on the repository's historical IDs.

For a named candidate:

```bash
vercel project inspect for-ai-e4mm
vercel project protection for-ai-e4mm --format json
```

If the CLI/account cannot resolve `for-ai-e4mm`, stop. Do not substitute another similarly named project without reconciling Git integration and domains first.

## Step 2 — verify Git and production identity

Confirm on the canonical project:

- Git repository is `wooyeonho/For-Ai`;
- intended production branch is correct;
- production domain/alias points to this project;
- the latest production deployment corresponds to an intended main commit;
- `for-ai` is not independently serving a second production identity.

Record the canonical project name, project ID, team, and production domain in the production runbook after verification.

## Step 3 — inspect protection before changing it

Vercel's current CLI supports reading/toggling project protection:

```bash
vercel project protection for-ai-e4mm --format json
```

Inspect at least:

- Vercel Authentication / SSO protection;
- password protection if present;
- trusted IP rules if configured;
- any protection-bypass automation configuration.

Do **not** remove protection from previews just to make production public. Keep the smallest scope change that restores the intended anonymous production surface.

## Step 4 — production SSO decision

If Vercel Authentication is protecting production unintentionally, disable **only the applicable SSO protection** after the project/account identity above is verified.

Current Vercel CLI form:

```bash
vercel project protection disable for-ai-e4mm --sso
```

Vercel's project API represents disabled Vercel Authentication as `ssoProtection: null`.

This command is documented here for an authorized operator; this repository branch does not execute it.

## Step 5 — do not use a bypass link as the public fix

Protection-bypass/share URLs are useful for automated tests or temporary reviewers, but they are not a substitute for a publicly reachable production acquisition surface.

For protected preview automation, Vercel supports a `VERCEL_AUTOMATION_BYPASS_SECRET` / `x-vercel-protection-bypass` header. Keep such secrets out of the repository and client bundles.

## Step 6 — anonymous production smoke

After an authorized protection/config change, test from a browser/session that is **not logged into Vercel** and has no bypass cookie.

Required public smoke surfaces:

1. `/`
2. representative public wiki/entity page(s)
3. `/llms.txt`
4. `/sitemap.xml`
5. feed/changelog discovery surfaces used by the product
6. the AI exposure-inspection/acquisition entry path intended for prospective customers

Expected result: application content/expected application status, not Vercel login/SSO/password interception.

## Step 7 — resolve the duplicate project

Only after `for-ai-e4mm` is proven canonical and public:

- compare `for-ai` Git link, domains, environment variables, and deployment history;
- remove its production traffic role or archive/delete it only through an explicit owner-approved operation;
- do not delete it merely because the names look duplicative;
- retain enough record to explain historical deployment evidence.

## Step 8 — regression protection

Add an external anonymous smoke check that fails if the production public URL starts returning Vercel Authentication/protection instead of the expected app surface.

If previews remain protected, automated preview tests should use the documented automation-bypass secret; production anonymous smoke must **not** use that bypass.

## Exit criteria

- one canonical production Vercel project is documented;
- anonymous production access works without a Vercel session or bypass secret;
- public AI discovery endpoints are reachable;
- the duplicate project cannot accidentally become a second production identity;
- preview protection remains as strict as intended;
- #505 contains final smoke evidence and can be closed.

## Current official Vercel references checked

- Project CLI: `vercel project protection [action] [name]`, including `--sso` and JSON inspection.
- Vercel Authentication: project SSO protection can be disabled with `ssoProtection: null` through the project API.
- Automated agent access: protected previews can use `VERCEL_AUTOMATION_BYPASS_SECRET` / `x-vercel-protection-bypass` without making the deployment public.

Re-check Vercel documentation immediately before changing account security settings because CLI/API behavior can change.
