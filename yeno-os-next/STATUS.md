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
3601e0a yeno-os-next: G6 functional self (PREP_ONLY) + G5 truth-state correction [large-diff-ok]
e482ddd yeno-os-next: persistent session continuity + fail-closed shell indirection guard [large-diff-ok]
06a0280 Mark yeno-os-next import as an intentional large diff [large-diff-ok]
18cc021 Add yeno-os-next: G0 Baseline Lock of the local Truth Kernel
```

**Four commits, not seven.** Seven YENO commits do not exist in this checkout.
If seven exist somewhere else (another WSL folder, a Claude Code checkout), that
work has not reached this repository and is therefore not part of the truth
state. Recovery plan is in §9.

The RUN-004 durability/gate work (§3–§5) is committed on top of these four as a
fifth commit on the same branch. PR #513 is not merged; merge stays an Owner
approval boundary.

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
```

All eleven are applied and pinned in `migrations/CHECKSUMS.json`; `node
scripts/pin-migration-checksums.mjs --check` reports `CHECKSUM_PIN_OK: 11
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
approval cite an immutable Owner Packet reference that exists on disk.

## 4. Tests

Exact command and original tail of output:

```text
$ node --test
ℹ tests 116
ℹ suites 0
ℹ pass 116
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

**116 tests.** 63 at G0/continuity, plus 11 functional-self, 9 durability soak,
5 gate-promotion, 14 G2 intake and 14 G3 governance tests. No 67-test run exists
in this checkout.

Other verifiers, all from this RUN:

```text
$ node scripts/local-ci.mjs        -> 13/13 PASS, LOCAL_CI_PASS
$ node src/cli.mjs verify          -> ok: true, failed: []
$ node scripts/independent-validation.mjs -> INDEPENDENT_VALIDATION_PASS
    PASS soak_verdicts_recomputed — 14 sessions, 14 passing
    PASS intake_coverage_recomputed — 1 inbox items, 1 source versions, 2 intakes
    PASS governor_recomputed — 143 red-team probes, 1 denials recorded
    PASS gate_promotions_recomputed — 2 gates passed
$ node scripts/self-adversarial-probes.mjs -> SELF_PROBES_PASS: 11/11
$ node scripts/assert-seeded-defect-detected.mjs -> seeded defects 12, detected 12, missed 0
$ node scripts/red-team-governor.mjs
    red-team probes: 38, refused: 38, allowed: 0, unverifiable: 0
    negative controls: 4, bypassed with the guard removed: 4
    REDTEAM_PASS
```

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
| G4 Workflow Runtime | `PENDING` | durable queue not built |
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
7a369689b268d1b962df7da1ddaef976c5917ca713120224091a62c0e04e1f79  evidence/REDTEAM-G3-001.json
fe881b2d793f7391ec35930d3e54aa17778d6963db22e3abc83b0aa50d33cc47  evidence/SOAK-cf77e410-d146-4b9f-b0d3-26bffaef8cb8.json
636917e73b61ced8c91ef651c4ef60bf0af6ec41d915751fce8ed8d1e6b940fa  evidence/raw/CAND-x-angeldot-2092234523471737056.html
```

Gate evidence IDs: G0 = `BASELINE-20260826`, G1 =
`SOAK-cf77e410-d146-4b9f-b0d3-26bffaef8cb8`. G2, G4 and G5 have **no** evidence
file, because those gates are not closed; claiming an ID for them would be
fabrication. G3 has a red-team artefact (`REDTEAM-G3-001`) but is still `PENDING`
— an artefact is not a promotion. This RUN's evidence is `evidence/RUN-006.md`; the external-lane
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
- `session_runs`: 4 rows — `RUN-002` (G1 continuity), `RUN-003` (G6 PREP_ONLY),
  `RUN-004` (G1 durability + gate guards), `RUN-005` (G2 intake slice + external
  lane re-adjudication), all `CHECKPOINTED` with evidence refs.
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
- `next_run`: next exact action is the G4 durable queue (retry/backoff/dead-letter,
  run steps, artifact store, scheduler OFF by default, deterministic resume/cancel,
  kill/reboot test proving zero duplicated external effects). The G3 governor entry
  was consumed by `RUN-006`.
- `approvals`: 1 row, revoked. `APR-85b98f0c…` was minted by the agent during a
  CLI smoke test with `granted_by = 'owner'` although the Owner never granted it;
  it was revoked on the record and migration `0011` now refuses any approval that
  does not cite an Owner Packet file present on disk.
- `redteam_probes` / `admission_attempts`: red-team results and admission denials
  are recorded and append-only; the independent validator recomputes G3 acceptance
  from these raw rows rather than from the `v_g3_acceptance` view.
- Event ledger: 35 events, head `12627a1b0b93e3995d59c8edf98222b0016e324588573f7e4c7766a00858893b`, chain ok, integrity `ok`, emergency stop `ON`.

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
