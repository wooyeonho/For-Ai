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
e482ddd yeno-os-next: persistent session continuity + fail-closed shell indirection guard [large-diff-ok]
06a0280 Mark yeno-os-next import as an intentional large diff [large-diff-ok]
18cc021 Add yeno-os-next: G0 Baseline Lock of the local Truth Kernel
```

**Three commits, not seven.** Seven YENO commits do not exist in this checkout.
If seven exist somewhere else (another WSL folder, a Claude Code checkout), that
work has not reached this repository and is therefore not part of the truth
state. Recovery plan is in §7.

```text
$ git status --short --branch
## devin/1787738184-yeno-os-next-g0...origin/devin/1787738184-yeno-os-next-g0
 M evidence/local-ci-latest.json
 M migrations/CHECKSUMS.json
 M scripts/independent-validation.mjs
 M src/cli.mjs
 M src/domain/status.mjs
?? evidence/local-ci-2026-08-26T11-20-13-424Z.json
?? migrations/0005_functional_self.sql
?? src/domain/self.mjs
?? test/functional-self.test.mjs
```

The G6 work is uncommitted: commit and push are Owner-approval boundaries.

## 3. Migrations and SHA-256

```text
8518c63459b7a679d51f10a452d6ccd6b5571c5ee5c657aa343e1e8f96343d61  migrations/0001_core.sql
7ce52c1eaf09d63e3c65a5fc948008fe74dec33fc921de2dbf206d9a84a8e8e4  migrations/0002_release_control.sql
c08ae635def3c2a041c2db58fcd33c76416d4c464b8c13252133b44937ddbd47  migrations/0003_continuity.sql
25b07e25f8ac6fdf29095ca5279b7f348f248706d4e6f35cf3bae841e4e3a82f  migrations/0004_handoff_view.sql
9e39681171f9af12e31d1b294f6f060905da690f51017f8846bd004b8bfd25fd  migrations/0005_functional_self.sql
```

All five are applied and pinned in `migrations/CHECKSUMS.json`. `0001` is untouched.

## 4. Tests

Exact command and original tail of output:

```text
$ node --test --test-reporter=spec
ℹ tests 74
ℹ suites 0
ℹ pass 74
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1098.884616
```

**74 tests, not 67.** 63 before this RUN, plus 11 functional-self tests. No
67-test run exists in this checkout.

Other verifiers, all from this RUN:

```text
$ node scripts/local-ci.mjs        -> 10/10 PASS, LOCAL_CI_PASS
$ node src/cli.mjs verify          -> ok: true (all checks)
$ node scripts/independent-validation.mjs -> INDEPENDENT_VALIDATION_PASS
$ node scripts/assert-seeded-defect-detected.mjs -> seeded defects 8, detected 8, missed 0
```

## 5. Gate truth state

| Gate | state | reason |
|---|---|---|
| G0 Baseline Lock | `IN_PROGRESS` | implementation and local evidence exist; merge of PR #513 not approved, so the gate is not closed |
| G1 Durable Truth | `PENDING` | crash/restart/replay and backup/restore proven; long-run soak evidence missing |
| G2 Unbounded Intake | `PENDING` | `NEEDS_SOURCE`: no official chat export ingested |
| G3 Governor | `PENDING` | governor implemented; operator surface and red-team evidence missing |
| G4 Workflow Runtime | `PENDING` | durable queue not built |
| G5 Agent Team | `PENDING` | `BLOCKED_PROVIDER_ACCESS`: no Claude Code / Codex / Devin bounded live RUN has passed |
| G6 Functional Self | `PENDING` | `PREP_ONLY`: implementation and tests proceed locally; promotion withheld until G5 is resolved |
| G7–G14 | `PENDING` | no evidence |

Implementation completeness is not gate acceptance. G5 is not PASSED and G6 is
not PASSED; nothing here is "release complete".

## 6. Evidence files and SHA-256

```text
2ff42d60b57d150b94f742662b23f9ce93c693619affef557ff914b7a6435d92  evidence/BASELINE-20260826.md
f6d890a9df565f08f15ff09096be961f0548d80ae8ffc5455845721dae8b2b93  evidence/OWNER-PACKET-001.md
31ba0bd064ac4ae1207efda9770cc60f963543b2fc4b7d2d3c3a8823c3d00610  evidence/RUN-002.md
```

There is no separate per-gate evidence file for G1–G5: those gates have not been
closed, so claiming an evidence ID for them would be fabrication. G0's evidence
is `BASELINE-20260826`; the current RUN's evidence is `evidence/RUN-003.md`.

## 7. Live database (state/yeno.db)

- `gates`: as in §5 (15 rows, G0 `IN_PROGRESS`, rest `PENDING`).
- `work_orders`: 0 rows.
- `session_checkpoints`: this table does not exist. Session continuity lives in
  `session_runs` (+ `blockers`, `next_run`, view `v_handoff`).
- `session_runs`: 1 row — `RUN-002`, gate `G1`, `CHECKPOINTED`, evidence `evidence/RUN-002.md`.
- `blockers`: 4 `WAITING` — official chat export missing (SOURCE), no provider
  auth wired (PROVIDER_ACCESS), no Windows build host (HARDWARE), merge PR #513
  (OWNER_APPROVAL).
- `next_run`: 8 entries queued, 4 takeable and 4 blocked by the above.
- Event ledger: 14 events, head `0b7d386ddda9904007f9a3320ec4218e2941054a0a7dca8962cad66c6105b839`.

## 8. Codex CLI facts on this machine

```text
$ which codex claude npx
/home/ubuntu/.nvm/versions/node/v24.19.0/bin/npx

$ codex --version
bash: line 1: codex: command not found

$ ls -la /home/ubuntu/.codex
ls: cannot access '/home/ubuntu/.codex': No such file or directory
```

- Codex CLI is **not installed** here: no executable path, no version, no config directory.
- Therefore there is no `/model` list and no provider stderr to report. The only
  error that exists is the `command not found` above.
- `gpt-5.6-luna` is recorded as the Owner-designated target model. Selecting it
  requires a Codex CLI that exists, which requires an install — an Owner
  approval boundary. See `evidence/OWNER-PACKET-002.md`.

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
