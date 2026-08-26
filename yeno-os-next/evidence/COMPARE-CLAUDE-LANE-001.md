# Comparison — Claude Code lane (Owner's Windows checkout) vs this lane (For-Ai PR #513)

Date: 2026-08-26
Compared by: Devin session `devin-bd9e1f8c`
Claude artifact: `yenoosnext20260826.zip` (Owner attachment), unpacked read-only at `/home/ubuntu/claude-yeno`
This lane: `/home/ubuntu/repos/For-Ai/yeno-os-next` on branch `devin/1787738184-yeno-os-next-g0`

Everything below was measured on this machine, not read off either lane's own claims.

## 1. Both lanes are real, and they are two different repositories

| | Claude lane | This lane |
|---|---|---|
| Root | `C:\Users\우연호\원앙` (standalone git repo, branch `main`, 17 commits) | `wooyeonho/For-Ai`, `yeno-os-next/`, branch `devin/1787738184-yeno-os-next-g0`, PR #513 |
| Migrations | 13 (`0001_core` … `0013_world_model_hardening`) | 9 (`0001_core` … `0009_intake`, the last still uncommitted) |
| Tests | 149 pass / 0 fail (`node --test`, re-run here on Node 24) | 88 pass / 0 fail |
| Source lines (src+scripts+test) | 5,720 | 5,656 |
| SQLite triggers in schema | **0** | **42** in migration files, **30** applied to the live DB (0009 not yet applied) |
| Live event ledger rows | 16 | 41 |

The two trees share no commits and no common ancestor. CLAUDE.md §"진실 상태" forbids forking YENO into two
repositories, so this is a decision the Owner has to make, not something either lane can settle by itself.

## 2. What the Claude lane has that this lane does not

- **Provider adapters that actually shell out**: `src/providers/{codex,claude_code,devin,fake}.mjs`, plus
  `provider_calls` records with auth state and cost.
- **A real Owner-approved live bounded codex RUN.** Its DB shows run `live-g5-retry-v2` = `DONE` with a
  `codex` `provider_calls` row `auth_state=AUTHENTICATED, status=EXECUTED`. It could do this because the
  Owner's machine has `codex` logged in (ChatGPT account) and was updated to 0.149.1 under an explicit
  8-step Owner approval. **This lane cannot reproduce that**: here `codex-cli 0.148.0` is installed but
  `Not logged in`, which is exactly why G5 is `BLOCKED_PROVIDER_ACCESS` on this side.
- **G4 Workflow Runtime**: durable queue with lease, retry/backoff, dead-letter, run steps, artifacts —
  and it caught a real failure in the wild (the codex model error retried and was then cancelled).
- **Gate lanes** (`gate_lanes`): a gate stays blocked until *every* lane clears, so G5 is
  `BLOCKED_PROVIDER_COVERAGE` with `codex=PASSED, claude_code=BLOCKED, devin=BLOCKED`. This is a strictly
  better shape than this lane's single `BLOCKED_PROVIDER_ACCESS` string.
- **More G6 depth**: memory with FTS5, desire decay with injectable clock, desire conflict resolution,
  Council influence via scope-hash gating, world model with freshness/expiry and contradiction detection.

## 3. What this lane has that the Claude lane does not

- **Machine enforcement in the schema.** The Claude lane has **zero** triggers: nothing in its database
  refuses a hand-written `UPDATE gates SET status='PASSED'`, an `UPDATE events`, or a `DELETE FROM blobs`.
  All of its invariants live in JS, so they hold only for callers that go through its JS. This lane puts 42
  triggers (30 applied so far) in the schema: append-only ledger, immutable vault bytes, title-only promotion block, cost hard
  gate, AX refusal, gate order, G1 soak floor, G6-needs-G5, per-cycle soak evidence.
- **Independent validation.** `scripts/independent-validation.mjs` re-derives integrity, checksums, the
  hash chain, projections, vault bytes, soak verdicts and gate promotions **without importing `src/`**.
  The Claude lane has `scripts/ci.mjs` only, which runs its own code against itself.
- **G1 durability at a different order of magnitude.** Claude lane G1 = 150 appends, one `SIGKILL`, three
  repeats, inside its test suite. This lane G1 = 300 cycles × (spawn → `SIGKILL` → replay → chain verify →
  projection determinism → `integrity_check` → backup → restore into a fresh DB → lease fencing), 30,000
  events, 1,800/1,800 probes, recorded per cycle as append-only rows plus `evidence/SOAK-cf77e410….json`.
- **Migration checksum pinning** (`migrations/CHECKSUMS.json`, `--check` in CI) and a standalone
  **seeded-defect detector** (8 seeded defects, 8 detected) as separate scripts, not only in tests.
- **Session continuity as data**: `session_runs`, `blockers`, `next_run`, `v_handoff` — the next session
  resumes from `handoff show`. The Claude lane regenerates `STATUS.md` from its DB, which covers the same
  need for a human reader but has no take/settle queue.

## 4. Where the two lanes disagree about the truth

- The Claude lane marks **G1–G4 PASSED**. By this lane's promotion rules, its G1 would be refused
  (`150 appends / 1 kill` is below the 100-crash-cycle floor) and its **G2 would be refused too**: its live
  DB has `sources=0, source_versions=0, projects=0`, i.e. the intake mechanism is proven by tests on
  synthetic data, with no ingested source of any kind. Its own G2 evidence says so honestly; the gate row
  says `PASSED` anyway. That is the exact gap this lane's `gate pass` guard exists to close.
- Both lanes agree G5 is not passed and G6 must stay PREP_ONLY. Nobody claimed release completion.

## 5. Assessment

Neither lane is a superset. The Claude lane is **wider** (providers + a real live codex RUN + G4 queue +
more G6), this lane is **harder to lie to** (schema enforcement + independent validator + real long-run
durability evidence + checksum pinning + continuity queue). The safe combination is one repository that
keeps this lane's enforcement layer and imports the Claude lane's breadth gate by gate, re-promoting each
imported gate through `gate pass` so the imported claims must survive the same machine checks — with G1 and
G2 explicitly re-earned rather than carried over.

## 6. Machine re-adjudication

The claims in §4 are no longer prose. `scripts/readjudicate-external-lane.mjs` applies this lane's
acceptance criteria to the Claude lane's own DB, migrations and CLI, and the same probes are fired at this
lane by `scripts/self-adversarial-probes.mjs` so the ruler is not rigged. Results and the two probe defects
found and fixed while self-testing: `evidence/READJUDICATION-CLAUDE-LANE-001.md`,
`evidence/READJUDICATION-CLAUDE-LANE-001.json`, `evidence/SELF-PROBES-001.json`.
