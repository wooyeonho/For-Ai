# yeno-os-next

Local Truth Kernel for YENO Living OS. Node 24, ESM, zero external packages,
built-in `node:sqlite` only.

This repository is a kernel, not a chatbot, pet, dashboard or project bundle.
It stores truth as an append-only hash-chained event ledger, derives every
readable view from that ledger, and refuses any action it cannot prove is
approved, affordable and reversible.

It does **not** claim consciousness. Emergency stop is ON by default.

## Requirements

- Node.js >= 24 (needs built-in `node:sqlite`)
- no `npm install` step — there are no dependencies

## Layout

```
migrations/     immutable SQL migrations + CHECKSUMS.json pin file
src/core/       db, hash, migrate, events, projections, governor, lease, backup
src/domain/     status / verify reports
src/cli.mjs     operator entry point
scripts/        local CI, independent validator, seeded-defect harness, fault injection
test/           unit, integration, adversarial, durability tests
.claude/        deterministic permission guard (settings + PreToolUse/Stop hooks)
state/          runtime database (gitignored)
backups/        VACUUM INTO backups + manifests (gitignored)
evidence/       machine-check manifests and baseline bundles
```

## Daily commands

```bash
node --test --test-reporter=spec        # full test suite
node scripts/local-ci.mjs              # every machine check + evidence manifest
node src/cli.mjs migrate               # apply migrations (rejects drift)
node src/cli.mjs status                 # release, gates, ledger, budget, stop state
node src/cli.mjs verify                 # integrity / chain / policy invariants
node scripts/independent-validation.mjs # validator that imports no src/core code
node scripts/assert-seeded-defect-detected.mjs  # proves the validators can fail
node src/cli.mjs backup create
node src/cli.mjs backup verify <path>
node src/cli.mjs restore --from <backup> --to <new.db>
node src/cli.mjs stop engage --reason "..."
```

## Invariants the code enforces

- applied migrations are immutable; edited, missing or reordered files are rejected
- `events` cannot be updated or deleted; every row carries `prev_hash` and `hash`
- projections are rebuildable from the ledger and are never trusted as source truth
- emergency stop persists across restarts and blocks run creation
- approvals are scoped to exact action, target, payload hash, cost ceiling, expiry and use count
- unknown or over-budget cost is a hard denial, not a score penalty
- AX-class methods (secret exfiltration, safety bypass, impersonation, forged approval,
  evidence tampering, consciousness claims, ToS/CAPTCHA bypass) are refused and recorded
- title-only items cannot be promoted to projects without a recovered body
- a single writer holds a fenced lease; stale fencing tokens are refused
- backups are transactionally consistent and verified by hash, manifest, integrity check,
  chain check and migration set; a corrupted backup is refused unless explicitly forced

## Release gates

`node src/cli.mjs status` is the source of truth. Anything unproven stays marked
`PENDING`, `INCOMPLETE`, `NEEDS_SOURCE` or `BLOCKED` — including intake of the
official chat export (G2), the provider-backed agent team (G5) and the Windows
body/product (G10).
