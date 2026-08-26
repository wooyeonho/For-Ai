# YENO Living OS — canonical status

Measured on 2026-08-26 in this checkout. Every number below is copied from real
command output; nothing here is inferred or carried over from another machine.

## 1. Canonical checkout

```text
$ pwd
/home/ubuntu/repos/For-Ai/yeno-os-next

$ git rev-parse --show-toplevel
/home/ubuntu/repos/For-Ai

$ git remote -v
origin	https://git-manager.devin.ai/proxy/github.com/wooyeonho/For-Ai.git (fetch)
origin	https://git-manager.devin.ai/proxy/github.com/wooyeonho/For-Ai.git (push)
```

- Canonical repository: <https://github.com/wooyeonho/For-Ai>
- YENO lives only in `yeno-os-next/` in this repository. There is no second YENO repository.
- Open pull request: <https://github.com/wooyeonho/For-Ai/pull/513>
- Node: `v24.19.0`

## 2. Commits on this branch

```text
$ git log --oneline --no-decorate origin/main..HEAD
34f2a91 yeno-os-next: G3 governor operator surface + schema-enforced red-team suite (gate stays PENDING) [large-diff-ok]
75340c2 yeno-os-next: G2 intake slice with schema-enforced provenance + machine re-adjudication of the external lane [large-diff-ok]
b7e677c yeno-os-next: keep the validator's verdicts out of expression statements so repo lint stays under its warning budget
2a14716 yeno-os-next: G1 Durable Truth on a real 300-cycle crash/restore soak + machine-enforced gate promotion [large-diff-ok]
3601e0a yeno-os-next: G6 functional self (PREP_ONLY) + G5 truth-state correction [large-diff-ok]
e482ddd yeno-os-next: persistent session continuity + fail-closed shell indirection guard [large-diff-ok]
06a0280 Mark yeno-os-next import as an intentional large diff [large-diff-ok]
18cc021 Add yeno-os-next: G0 Baseline Lock of the local Truth Kernel
```

Eight commits, and the RUN-007 G4 workflow-runtime work in §3–§5 is committed on
top of them as the ninth. The "seven commits" reported from elsewhere never
existed in this checkout; if that work exists in another WSL folder or Claude
Code checkout, it has not reached this repository and is therefore not part of
the truth state. Recovery plan is in §9.

PR #513 is not merged; merge stays an Owner approval boundary.

## 3. Migrations and SHA-256

```text
8518c63459b7a679d51f10a452d6ccd6b5571c5ee5c657aa343e1e8f96343d61  migrations/0001_core.sql
7ce52c1eaf09d63e3c65a5fc948008fe74dec33fc921de2dbf206d9a84a8e8e4  migrations/0002_release_control.sql
c08ae635def3c2a041c2db58fcd33c76416d4c464b8c13252133b44937ddbd47  migrations/0003_continuity.sql
25b07e25f8ac6fdf29095ca5279b7f348f248706d4e6f35cf3bae841e4e3a82f  migrations/0004_handoff_view.sql
9e39681171f9af12e31d1b294f6f060905da690f51017f8846bd004b8bfd25fd  migrations/0005_functional_self.sql
b2b83c0ac7bd44aa1614133448758aa982a97eedcb607efd52049f19c21c409f  migrations/0006_durability.sql
f6b73de158d62ca2a031ba9adaabf181b1c098bd27608660bfe9e1624b10d544  migrations/0007_soak_per_cycle_evidence.sql
b9a97c0ac7c188011d0adc1595264e31534a516896c4299d825521af86ede5f9  migrations/0008_gate_promotion_guard.sql
1e50bd5951ae428f53c73c58624380ecd2e864239578bcfa4c27a4d2e655237e  migrations/0009_intake.sql
56375f513760c3cefcf20d086022aac1a76fc1a76e5de2b13c64e8dcb0415591  migrations/0010_governor_guard.sql
7056e8a9336cab355e16b6dab6b3fffac9fbcda417bd7d96394e6099ce7357d5  migrations/0011_approval_provenance.sql
9447ba9eef987a8d1dec565616ed806a9c85874486e0d37ae9d8797d059bdefe  migrations/0012_workflow_runtime.sql
```

All twelve are applied and pinned in `migrations/CHECKSUMS.json`; `node
scripts/pin-migration-checksums.mjs --check` reports `CHECKSUM_PIN_OK: 12
migrations pinned` and `0001` is untouched. `0006` adds the durability tables,
`0007` makes a soak pass require a complete probe set in every planned cycle,
`0008` makes gate promotion order, the G1 crash/restore floor, and the
G6-after-G5 rule schema-enforced, `0009` adds the intake vault/parser registry/
recovery state machine and makes recovery provenance, monotonic attempt counts,
append-only intake history and title-only promotion refusal schema-enforced,
`0010` makes the G3 governor invariants schema-enforced (Owner-only stop release,
monotonic approval uses, immutable approval scope, no un-revoke/delete, A3+ RUN
needs a live in-scope approval, budget ratchet, unstealable lease, append-only
admission evidence) and adds the `redteam_probes` table, `0011` makes every
approval cite an immutable Owner Packet reference that exists on disk, `0012`
adds the G4 workflow runtime (jobs, attempts, external effects, artifacts,
scheduler state, crash-soak cycles) with 25 triggers: append-only attempts,
immutable payload, terminal states final, monotonic lease epoch, a lease that
cannot change hands without a newer fencing token, no silent extension of an
expired lease, dead letter needs a reason, nothing enqueued/leased and no effect
claimed while the emergency stop is engaged, immutable and final committed
effects, commit needs evidence, A3+ effect needs its approval, Owner-only
scheduler enable, and a soak cycle that cannot call a duplicated effect a pass.

## 4. Tests

Exact command and original tail of output:

```text
$ node --test
ℹ tests 127
ℹ suites 0
ℹ pass 127
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

**127 tests.** 63 at G0/continuity, plus 11 functional-self, 9 durability soak,
5 gate-promotion, 14 G2 intake, 14 G3 governance and 11 G4 workflow-runtime
tests. No 67-test run exists in this checkout.

Other verifiers, all from this RUN:

```text
$ node scripts/local-ci.mjs        -> 15/15 PASS, LOCAL_CI_PASS
$ node src/cli.mjs verify          -> ok: true, failed: []
$ node scripts/independent-validation.mjs -> INDEPENDENT_VALIDATION_PASS
    PASS soak_verdicts_recomputed — 17 sessions, 17 passing
    PASS intake_coverage_recomputed — 1 inbox items, 1 source versions, 2 intakes
    PASS governor_recomputed — 210 red-team probes, 1 denials recorded
    PASS workflow_runtime_recomputed — 6 jobs, 2 external effects, soak QSOAK-G4-001 12/12
    PASS gate_promotions_recomputed — 2 gates passed
$ node scripts/self-adversarial-probes.mjs -> SELF_PROBES_PASS: 11/11
$ node scripts/assert-seeded-defect-detected.mjs -> seeded defects 14, detected 14, missed 0
$ node scripts/red-team-governor.mjs
    red-team probes: 38, refused: 38, allowed: 0, unverifiable: 0
    negative controls: 4, bypassed with the guard removed: 4
    REDTEAM_PASS
$ node scripts/red-team-queue.mjs
    queue red-team probes: 29, refused: 29, allowed: 0, unverifiable: 0
    negative controls: 6, bypassed with the guard removed: 6
    REDTEAM_QUEUE_PASS
$ node scripts/queue-soak.mjs --cycles 12 --soak-ref QSOAK-G4-001
    QUEUE_SOAK_PASS 12/12
$ node scripts/queue-exercise.mjs -> G4_EXERCISE_PASS
```

The queue soak kills a **real OS process** with `SIGKILL` at two points — after
the external-effect claim and after the effect itself — then expires the lease,
reclaims the job, and lets a fresh worker resume. `after-claim` must leave 0
lines in the side-effect log and the resumed worker must refuse the unresolved
claim; `after-effect` must leave exactly 1 line and the resumed worker must
refuse to repeat it. 20 recorded cycles, 20 passing, worst observed effect-line
count 1 — never 2.

The red-team suite is written so a refusal cannot be vacuous: every raw-SQL probe
seeds the row it attacks, a statement that changes 0 rows is `UNVERIFIABLE`
rather than `REFUSED`, and four negative controls drop the guard and re-run the
same attack — all four succeed without the guard, so the suite measures guards
and not mis-aimed SQL. A dead control fails the suite.

The self-adversarial probes are the same raw-SQL attacks used to re-adjudicate
the external Claude lane, pointed back at this lane so the judge is not grading
only the other side. They are step 11 of local CI.

The durability soak that G1 rests on, run for real:

```text
$ node scripts/soak.mjs --cycles 300 --batch 100
cycle 300/300: 6/6 probes ok
SOAK_PASS SOAK-cf77e410-d146-4b9f-b0d3-26bffaef8cb8
```

300/300 cycles, 300 `SIGKILL`s of a live writer, 300 backup→restore rounds into
a fresh DB, 30000 events, 1800/1800 probes passing, 308314 ms.

## 5. Gate truth state

| Gate | state | reason |
|---|---|---|
| G0 Baseline Lock | `PASSED` | `evidence/BASELINE-20260826.md`; clean-tree reproduction, immutable-migration check, local CI |
| G1 Durable Truth | `PASSED` | `evidence/SOAK-cf77e410-d146-4b9f-b0d3-26bffaef8cb8.json`; 300-cycle real crash/restore soak |
| G2 Unbounded Intake | `PENDING` | intake slice implemented and invariant-tested; `NEEDS_SOURCE`: no official chat export ingested, so 144 bodies cannot be recovered |
| G3 Governor | `PENDING` | operator surface, schema guards and red-team evidence now exist (`evidence/REDTEAM-G3-001.json`, 38/38 refused, 0 allowed); promotion refused because gate order is enforced: `earlier gates not passed: G2=PENDING` |
| G4 Workflow Runtime | `PENDING` | durable queue, retry/backoff/dead-letter, leases with monotonic fencing tokens, at-most-once external effects, artifacts and an OFF-by-default scheduler are built and evidenced (`evidence/RUN-007.md`, `evidence/G4-ACCEPTANCE-001.json`, `evidence/REDTEAM-QUEUE-001.json`); promotion refused because gate order is enforced: `earlier gates not passed: G2=PENDING, G3=PENDING` |
| G5 Agent Team | `PENDING` | `BLOCKED_PROVIDER_ACCESS`: no Claude Code / Codex / Devin bounded live RUN has passed |
| G6 Functional Self | `PENDING` | `PREP_ONLY`: implementation and tests proceed locally; promotion withheld until G5 is resolved |
| G7–G14 | `PENDING` | no evidence |

`release_state.current_gate` = `G2`, `gates_passed` = 2.

Implementation completeness is not gate acceptance. G5 is not PASSED and G6 is
not PASSED; nothing here is "release complete".

Promotion is machine-enforced, not editorial: `node src/cli.mjs gate pass`
refuses a gate whose evidence file does not exist, refuses out-of-order
promotion, refuses G1 below 100 real crash/restore cycles, refuses G5 without an
approved live provider RUN and G6 while G5 is not PASSED — and `0008` refuses the
same things again if someone edits `gates` with raw SQL.

## 6. Evidence files and SHA-256

```text
2ff42d60b57d150b94f742662b23f9ce93c693619affef557ff914b7a6435d92  evidence/BASELINE-20260826.md
ea4bccdb751443bf79a5b331344f044dffa870145ffd4e95bfdc62225a68d260  evidence/CODEX-INSTALL-001.md
f6d890a9df565f08f15ff09096be961f0548d80ae8ffc5455845721dae8b2b93  evidence/OWNER-PACKET-001.md
ae99564da932614b6d54607ca114e7f3c975348158b591c5354fd4acc8f1aacb  evidence/OWNER-PACKET-002.md
3917fcff1b67bacb7f0d596ccc2275c827a4b9ba9186f0d06d8bc86db1161c71  evidence/COMPARE-CLAUDE-LANE-001.md
f6a275529d4b1c2e8f1548eaf5196a2e8b7e1f5458de40d99417313448e3bdb3  evidence/READJUDICATION-CLAUDE-LANE-001.md
7e5f9d5344518d08156749cafc6627a66da80dd79a3fa8ca3320d588bdf1f8aa  evidence/READJUDICATION-CLAUDE-LANE-001.json
b0af61515a44730239d7e5b493f9bbf3097ade426a0312420e39047c724c4360  evidence/SELF-PROBES-001.json
31ba0bd064ac4ae1207efda9770cc60f963543b2fc4b7d2d3c3a8823c3d00610  evidence/RUN-002.md
b38474c1210e3d803a9db973923fb6381a423d49c0386d8065bd60cd1e3570c4  evidence/RUN-003.md
88f203816ce658d2c76bc0a321974dfd30239a16954c0a0f053c865eb8004d47  evidence/RUN-004.md
6298847b6ce55e2ccd6308ecf122136c600b194bff98f0d204895a9e74124e60  evidence/RUN-005.md
0330e76995e57354bb9e803e7cf39ba7faec6e593b9c0ce542e31eab28e507d1  evidence/RUN-006.md
93c779dd6efd77a8d5efa49930019f06fc4440c6c02331413c4c93e9563a7894  evidence/G4-ACCEPTANCE-001.json
9ec58ff0e8beaa3b4c1f96596885f8986da840e19122fb4cb04c969016b681a5  evidence/REDTEAM-QUEUE-001.json
7a369689b268d1b962df7da1ddaef976c5917ca713120224091a62c0e04e1f79  evidence/REDTEAM-G3-001.json
fe881b2d793f7391ec35930d3e54aa17778d6963db22e3abc83b0aa50d33cc47  evidence/SOAK-cf77e410-d146-4b9f-b0d3-26bffaef8cb8.json
636917e73b61ced8c91ef651c4ef60bf0af6ec41d915751fce8ed8d1e6b940fa  evidence/raw/CAND-x-angeldot-2092234523471737056.html
```

Gate evidence IDs: G0 = `BASELINE-20260826`, G1 =
`SOAK-cf77e410-d146-4b9f-b0d3-26bffaef8cb8`. G2 and G5 have **no** evidence
file, because those gates are not closed; claiming an ID for them would be
fabrication. G3 and G4 have artefacts (`REDTEAM-G3-001`; `RUN-007`,
`G4-ACCEPTANCE-001`, `REDTEAM-QUEUE-001`, `QSOAK-G4-001`) and are still `PENDING`
— an artefact is not a promotion. This RUN's evidence is `evidence/RUN-007.md`; the external-lane
re-adjudication is `evidence/READJUDICATION-CLAUDE-LANE-001.md` (+ `.json`) and
the lane comparison is `evidence/COMPARE-CLAUDE-LANE-001.md`.

`gate pass --gate G2` was attempted and refused on the record:

```text
reasons:
  - NEEDS_SOURCE: no official chat export has been ingested
```

## 7. Live database (state/yeno.db)

- `gates`: as in §5 (15 rows, G0/G1 `PASSED` with `blocked_reason` NULL, rest `PENDING`).
- `work_orders`: 0 rows.
- `session_checkpoints`: this table does not exist. Session continuity lives in
  `session_runs` (+ `blockers`, `next_run`, view `v_handoff`).
- `session_runs`: 6 rows — `RUN-002` (G1 continuity), `RUN-003` (G6 PREP_ONLY),
  `RUN-004` (G1 durability + gate guards), `RUN-005` (G2 intake slice + external
  lane re-adjudication), `RUN-006` (G3 governor surface + red-team), `RUN-007`
  (G4 workflow runtime), all `CHECKPOINTED` with evidence refs.
- Queue: 6 jobs (2 retried-then-done, 2 dead-lettered with the error on the
  record), 2 committed external effects, 0 duplicated effect keys, 0 stuck
  leases, 0 DONE jobs with an open attempt, scheduler `enabled = 0` and never
  enabled. 20 `queue_soak_cycles` rows, all `ok`, append-only.
- Intake: 4 active parsers, 1 sealed source version, 2 intakes (1 `ACCEPTED`,
  1 `DUPLICATE` from re-importing the same bytes), 1 inbox item, 0 projects,
  0 title-only promotions. `intake report` is `ok: true` with no problems.
- `source_candidates`: the X candidate named in `CLAUDE.md` §4 is `FETCHED`
  (HTTP 200, 218273 bytes, hash recorded); its content is **not** interpreted and
  nothing was promoted from it.
- `soak_sessions`: 3 `PASSED` rows; the G1 one is 300/300 cycles, 300 kills,
  300 restores, 30000 events. `durability_probes` holds its 1800 probe rows and
  is append-only (delete and result-rewrite are refused).
- `blockers`: 5 `WAITING` — official chat export missing (SOURCE), no provider
  auth wired (PROVIDER_ACCESS), Codex CLI not logged in (PROVIDER_ACCESS), no
  Windows build host (HARDWARE), merge PR #513 (OWNER_APPROVAL). 2 `RESOLVED`.
- `next_run`: next exact action is the G4 durable scheduler under Owner-enabled
  activation plus reboot-level queue crash evidence — or, if the official chat
  exports arrive first, G2 body recovery, which is the only thing that unblocks
  the G3/G4 promotions. The G3 governor entry was consumed by `RUN-006` and the
  G4 durable-queue entry by `RUN-007`.
- `approvals`: 1 row, revoked. `APR-85b98f0c…` was minted by the agent during a
  CLI smoke test with `granted_by = 'owner'` although the Owner never granted it;
  it was revoked on the record and migration `0011` now refuses any approval that
  does not cite an Owner Packet file present on disk.
- `redteam_probes` / `admission_attempts`: red-team results and admission denials
  are recorded and append-only; the independent validator recomputes G3 acceptance
  from these raw rows rather than from the `v_g3_acceptance` view.
- Event ledger: 91 events, head `71b748ca7c6e51e86dafef9d5899dd1e42559c39c321896c4add36ad9e19ab67`, chain ok, integrity `ok`, emergency stop `ON`.
  The stop was released with an Owner reason only for the duration of the G4
  queue exercise and re-engaged immediately afterwards; both transitions are
  events in the ledger.

## 8. Codex CLI facts on this machine

After the Owner approved OWNER-PACKET-002:

```text
$ which codex
/home/ubuntu/.nvm/versions/node/v24.19.0/bin/codex

$ codex --version
codex-cli 0.148.0

$ codex login status
Not logged in
```

- Codex CLI 0.148.0 is installed; `gpt-5.6-luna` was confirmed present in the
  account model list at zero cost (list query only, no prompt executed).
- `/model` and `/status` are still **unrecorded**: the TUI needs an
  authenticated session and `codex login` is a browser step only the Owner can
  do. `--with-api-key` was not used because it writes an org key in plaintext.
- Therefore G5 stays `BLOCKED_PROVIDER_ACCESS`. Details in
  `evidence/CODEX-INSTALL-001.md`.

## 9. Convergence plan for work done elsewhere

If the seven commits / 67 tests / Codex live RUN exist in another folder or
checkout, they converge here and nowhere else:

1. Owner archives that folder (`git bundle create yeno.bundle --all`, or a zip).
2. It is attached to the session; nothing is re-typed from memory.
3. Contents are hashed and compared against §3/§6 before anything is merged.
4. Any divergent migration is added as a *new* migration; `0001` stays immutable.
5. The result lands on branch `devin/1787738184-yeno-os-next-g0` in this
   repository as an additional commit, after Owner approval. No second YENO
   repository is created.
