# Claims Ops Autopilot

For-Ai claim operations are intentionally **human-approved** and **source-backed**. The autopilot workflow reduces repetitive mechanics without inventing facts.

## What it automates

The `Claims Ops Autopilot` GitHub Actions workflow runs on a weekly schedule and can also be started manually.

It performs these steps:

1. Generate editable payload templates from the seed backlog into `data/claim-payloads`.
2. Batch-apply only completed payloads.
3. Validate verified-claims data.
4. Run lint and build.
5. Open a pull request if files changed.

## What it does not automate

The workflow does **not** search the web, infer claim values, or mark unknown facts as verified. A payload is only applied when every claim has:

- `claim_value`
- `confidence`
- at least one source with `title` or `url`
- `observed_at`

Incomplete generated templates are skipped by default.

## Payload directories

- Claims Ops automation writes generated templates to `data/claim-payloads` and batch-applies that same directory. This mirrors `.github/workflows/claims-ops.yml`, which runs `npm run claims:generate-payloads -- --out data/claim-payloads` followed by `npm run claims:batch -- data/claim-payloads`.
- Local manual use of `npm run claims:generate-payloads` keeps its default output at `data/payloads`; run `npm run claims:batch -- data/payloads` for that manual path.
- When documenting the automated workflow, use `data/claim-payloads`; when documenting local manual commands without `--out`, use `data/payloads`.

## Manual run examples

Generate up to 10 templates for the default backlog:

```text
Actions → Claims Ops Autopilot → Run workflow
```

Generate KR finance templates only:

```text
limit: 10
country: KR
category: finance
strict: false
```

Use `strict: true` when you want the workflow to fail if any payload in `data/claim-payloads` is incomplete.

## Review rule

Before merging an autopilot PR, reviewers must verify that every completed payload uses traceable official or authoritative sources and that no unknown fact was guessed.
