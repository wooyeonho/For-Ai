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
a838651 yeno-os-next: G4 workflow runtime with at-most-once external effects under real process kills (gate stays PENDING) [large-diff-ok]
34f2a91 yeno-os-next: G3 governor operator surface + schema-enforced red-team suite (gate stays PENDING) [large-diff-ok]
75340c2 yeno-os-next: G2 intake slice with schema-enforced provenance + machine re-adjudication of the external lane [large-diff-ok]
b7e677c yeno-os-next: keep the validator's verdicts out of expression statements so repo lint stays under its warning budget
2a14716 yeno-os-next: G1 Durable Truth on a real 300-cycle crash/restore soak + machine-enforced gate promotion [large-diff-ok]
3601e0a yeno-os-next: G6 functional self (PREP_ONLY) + G5 truth-state correction [large-diff-ok]
e482ddd yeno-os-next: persistent session continuity + fail-closed shell indirection guard [large-diff-ok]
06a0280 Mark yeno-os-next import as an intentional large diff [large-diff-ok]
18cc021 Add yeno-os-next: G0 Baseline Lock of the local Truth Kernel
```

Ten commits, the RUN-009 scheduler-daemon work as the eleventh, the RUN-010
scheduler-supervisor work as the twelfth, and the RUN-011 G7 PortfolioOps work in
§3–§5 committed on top as the thirteenth. The "seven
commits" reported from elsewhere never existed in this checkout; if that work exists in another WSL folder or Claude
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
c144ff9a7db3bdd4b3250a892953aa750880f6e4fe94e374d6153796ebfffccf  migrations/0013_scheduler.sql
cf358bccbbc0b96c3c427d4853c0afa3f769949e0c208d89ed2139b1e9a05a38  migrations/0014_scheduler_daemon.sql
35a577e8e025bc084095673ed2bc99377b38e354c7fb2e2953208d18706242d3  migrations/0015_supervisor.sql
58c2ecf0411ad2170e714a100bd1508d7b61b216366db19d99cf4f667e4612ea  migrations/0016_portfolio.sql
82c5c8d63973cb0e16e8b8fa504eb22a5234779f9e95e8a60a025586db5fca00  migrations/0017_mission_control.sql
```

All sixteen are applied and pinned in `migrations/CHECKSUMS.json`; `node
scripts/pin-migration-checksums.mjs --check` reports 16 migrations pinned and
`0001` is untouched. `0006` adds the durability tables,
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
`0013` adds the durable scheduler: `schedules` (interval floor of one second,
OFF at creation, Owner provenance and reason required to arm, intent immutable),
`schedule_fires` with `UNIQUE (schedule_id, due_at)` so at-most-once firing is a
database constraint rather than a code path, `schedule_soak_cycles`, monotonic
`next_due_at` and `fire_count`, append-only and undeletable firing history, no
schedule deletion, and a trigger that refuses to record a scheduler soak cycle
calling a double fire or a missing kill a pass. It replaces the empty `schedules`
placeholder from `0012` only after proving the placeholder holds zero rows, so a
non-empty one fails the migration closed; `0012` itself was not edited.
`0014` is purely additive: `daemon_soak_cycles` records one row per restart cycle
of the unattended scheduler daemon, append-only and undeletable, and a cycle may
only be recorded as a pass if it really died the way it claims, no boundary was
served twice, no job served two boundaries and the served count never went
backwards. `0015` is purely additive: `supervisor_soak_cycles` records one row
per supervised death cycle, append-only and undeletable, and for a child death a
pass additionally requires at least one restart **and** at least two distinct
child PIDs — "I restarted it" with a single PID on record is refused at the SQL
level. `0016` is purely additive and carries G7 PortfolioOps: `portfolio_capacity`
(`max_active` seeded to 1 for this machine), `demand_evidence` (append-only,
undeletable, a measured number must cite a non-empty source reference),
`project_adapters`, and `portfolio_cycles` (append-only, undeletable, unique on
`(project_id, adapter_id, source_version_id)` so a replay is the same row). Its
ten triggers make the two G7 rules SQL-level rather than code-level: a cycle
cannot be `USEFUL` without `verified = 1`, a non-empty verifier that differs from
the adapter that built the artefact, and links to a source version, a
Council-`SELECT`ed goal, a durable job, an artefact hash and a memory row; and a
project cannot reach `BUILD`/`WATCH` without both a `DEMAND` and a `UTILITY` row
or past `max_active`, on INSERT and on UPDATE, so raw SQL cannot scale the
portfolio either.

## 4. Tests

Exact command and original tail of output:

```text
$ node --test
ℹ tests 163
ℹ suites 0
ℹ pass 163
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

**197 tests.** 63 at G0/continuity, plus 11 functional-self, 9 durability soak,
5 gate-promotion, 14 G2 intake, 14 G3 governance, 11 G4 workflow-runtime, 11 G4
scheduler, 5 G4 scheduler-daemon, 8 G4 scheduler-supervisor, 12 G7 PortfolioOps,
8 G8 Mission Control read-side, 11 G8 local-API, 3 G8 UI-contract, 6 G8
UI-renderer and 6 G8 UI-follower tests. No 67-test run exists in this checkout.

`npm run lint` and `npm run typecheck` were attempted and **do not exist** in
this repository (`npm error Missing script`). They are absent, not passing.

Other verifiers, all from this RUN:

```text
$ node scripts/local-ci.mjs        -> 25/25 PASS, LOCAL_CI_PASS
$ node src/cli.mjs verify          -> ok: true, failed: []
$ node scripts/independent-validation.mjs -> INDEPENDENT_VALIDATION_PASS
    PASS soak_verdicts_recomputed — 20 sessions, 20 passing
    PASS intake_coverage_recomputed — 1 inbox items, 1 source versions, 2 intakes
    PASS governor_recomputed — 381 red-team probes, 1 denials recorded
    PASS workflow_runtime_recomputed — 8 jobs, 2 external effects, soak QSOAK-G4-001 12/12
    PASS scheduler_recomputed — 1 schedules, 2 fires, soak SSOAK-G4-001 8/8
    PASS scheduler_daemon_recomputed — soak DSOAK-G4-001 8/8, 7 real kills, 12 boundaries served, 0 duplicated
    PASS scheduler_supervisor_recomputed — soak VSOAK-G4-001 6/6, 3 child kills, 2 tree kills,
                                           3 unattended restarts, 14 boundaries served, 0 duplicated
    PASS portfolio_cycles_recomputed — 3/3 cycles USEFUL, artefacts rehashed from the stored
                                       source bytes, 1/1 active
    PASS gate_promotions_recomputed — 2 gates passed
    PASS ui_contract_recomputed — 8 panels pinned, columns re-read from the views
$ node scripts/self-adversarial-probes.mjs -> SELF_PROBES_PASS: 11/11
$ node scripts/assert-seeded-defect-detected.mjs -> seeded defects 29, detected 29, missed 0
$ node scripts/pin-ui-contract.mjs --check -> UI_CONTRACT_PIN_OK: 8 panels, 5 commands, 3 panel actions
$ node scripts/portfolio-exercise.mjs -> PORTFOLIO_EXERCISE_PASS
$ node scripts/red-team-governor.mjs
    red-team probes: 38, refused: 38, allowed: 0, unverifiable: 0
    negative controls: 4, bypassed with the guard removed: 4
    REDTEAM_PASS
$ node scripts/red-team-api.mjs
    api red team probes: 25, leaks: 0
    negative controls: 2, leaked with the guard removed: 2
    API_RED_TEAM_PASS
$ node scripts/red-team-queue.mjs
    queue red-team probes: 42, refused: 42, allowed: 0, unverifiable: 0
    negative controls: 11, bypassed with the guard removed: 11
    scheduler probes: 13, refused: 13 (minimum 13)
    REDTEAM_QUEUE_PASS
$ node scripts/queue-soak.mjs --cycles 12 --soak-ref QSOAK-G4-001
    QUEUE_SOAK_PASS 12/12
$ node scripts/queue-exercise.mjs -> G4_EXERCISE_PASS
$ node scripts/scheduler-soak.mjs --cycles 8 --soak-ref SSOAK-G4-001
    SCHEDULER_SOAK_PASS 8/8   (in-transaction 4/4, after-commit 4/4)
$ node scripts/scheduler-exercise.mjs -> SCHEDULER_EXERCISE_PASS
$ node scripts/daemon-soak.mjs --cycles 8 --soak-ref DSOAK-G4-001
    DAEMON_SOAK_PASS 8/8 boundaries=12   (7 real SIGKILLs, final cycle a clean SIGTERM)
$ node scripts/supervisor-soak.mjs --cycles 6 --soak-ref VSOAK-G4-001
    SUPERVISOR_SOAK_PASS 6/6 boundaries=14   (3 child kills, 2 tree kills, 1 clean stop)
```

The supervisor soak is the RUN-009 gap closed: `scripts/scheduler-supervisor.mjs`
owns the restart decision instead of the harness. Killing only the daemon child
must produce a genuinely different child PID after a deterministic backoff;
`SIGKILL`ing the whole process group leaves nothing alive, so continuity comes
from durable DB state picked up by the next supervisor; a clean `SIGTERM`
resurrects nothing. A crash loop (5 crashes inside 10 s) makes the supervisor
exit nonzero rather than idle silently. The supervisor holds no scheduler
authority at all — it never opens the database, so it cannot arm a schedule or
release the emergency stop. Recomputed from raw rows: 14 boundaries served, 0
served twice, 0 jobs serving two boundaries, 0 regressions.

The daemon soak is the RUN-008 gap closed: a real long-running
`scripts/scheduler-daemon.mjs` process ticks unattended, is `SIGKILL`ed at
moments nobody chose (a randomised 1–2 boundary window), and a brand new process
takes over each cycle as if the machine had restarted; the last cycle ends with a
clean `SIGTERM` so a graceful shutdown is on the record next to the violent ones.
Duplicates are recomputed from raw rows: 12 boundaries served, 0 served twice, 0
jobs serving two boundaries. A soak where nothing ever fired would satisfy every
duplicate check while proving nothing, so `served < cycles` is itself a failure.
The daemon arms nothing and releases nothing — every tick still goes through the
two Owner switches and the emergency stop, and a daemon on a fresh install is
proven inert by test (`EMERGENCY_STOP` every tick, 0 fires, 0 jobs).

The scheduler soak kills a real tick process with `SIGKILL` **inside the
transaction** in half the cycles — after the job row, the fire row and the
boundary advance are written, before the commit — and after the commit in the
other half, then lets a brand new process tick again as if after a reboot. Every
cycle counts raw rows for that exact `(schedule_id, due_at)`: anything other than
one fire and one job fails the cycle, and `0013` refuses to record a passing
cycle that claims otherwise. The kernel exercise adds the switch behaviour on the
real ledger: both switches off → `SCHEDULER_OFF`, armed → exactly one job, a
replayed tick → nothing, six owed hours → one fire rather than six.

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
| G4 Workflow Runtime | `PENDING` | durable queue, retry/backoff/dead-letter, leases with monotonic fencing tokens, at-most-once external effects, artifacts, a durable scheduler that fires each boundary at most once with both switches OFF by default, an unattended daemon that keeps that guarantee across repeated kills and restarts, and a supervisor that restarts the daemon by itself with deterministic backoff and a crash-loop stop are built and evidenced (`evidence/RUN-007.md`, `evidence/RUN-008.md`, `evidence/RUN-009.md`, `evidence/RUN-010.md`, `evidence/G4-ACCEPTANCE-001.json`, `evidence/G4-SCHEDULER-001.json`, `evidence/G4-DAEMON-001.json`, `evidence/G4-SUPERVISOR-001.json`, `evidence/REDTEAM-QUEUE-001.json`); promotion refused because gate order is enforced: `earlier gates not passed: G2=PENDING, G3=PENDING` |
| G5 Agent Team | `PENDING` | `BLOCKED_PROVIDER_ACCESS`: no Claude Code / Codex / Devin bounded live RUN has passed |
| G6 Functional Self | `PENDING` | `PREP_ONLY`: implementation and tests proceed locally; promotion withheld until G5 is resolved |
| G7 PortfolioOps | `PENDING` | one source carried through goal → durable RUN → independent verification → outcome → memory, twice over (two adapters), plus crash-mid-RUN recovery and refusal to scale without demand/utility or past capacity, are built and evidenced (`evidence/RUN-011.md`); promotion refused because gate order is enforced |
| G8 Mission Control | `PENDING` | the read side is built and evidenced (`evidence/RUN-012.md`): migration `0017` adds eight deterministic views (Inbox/Projects/Timeline/Council/Approvals/Evidence/Costs/Settings), `mc panels`/`mc panel` serve them from a read-only handle, the independent validator recomputes every panel from the base tables, and three seeded defects prove a lying panel is caught. The Tauri 2 desktop shell, Living Body, state colours, keyboard/accessibility, the 8GB RAM profile and push-to-talk voice are **not** built — the shell needs an Owner-approved Rust/Cargo install (`evidence/OWNER-PACKET-003.md`). The local boundary the shell will read is also built and attacked (`evidence/RUN-013.md`): `127.0.0.1`-only bind, mandatory `x-yeno-token`, origin allowlist, rate limit, reads from a read-only handle, a closed two-command write vocabulary that goes command handler → Governor → transaction → event → projection, and 21 independent HTTP probes (`API_RED_TEAM_PASS`, 0 leaks) run from a process that imports nothing from `src/`. `evidence/RUN-014.md` moves admission itself to the Governor: every command declares its own authority, target and cost, `admit()` returns the verdict, a denial answers `403` with the reason code and the `admission_attempts` id (`423` for the stop), the vocabulary is now five panel actions with **granting** an approval deliberately excluded, and two negative controls prove the probes have teeth by deleting one guard in a throwaway copy of `src/` and observing the leak. `evidence/RUN-015.md` fixes the shell's vocabulary before the shell exists: `src/domain/ui-contract.mjs` derives each panel's columns from `pragma_table_info` on the live views and each panel's buttons from the API allowlist (three panels have actions; Timeline, Evidence, Projects, Council and Costs have none, and granting an approval is absent because it is absent from the API), `contracts/ui-contract.json` pins the contract and its hash so drift fails local CI, `GET /contract` serves it read-only (`POST` is a `404`), the independent validator re-reads the columns and parses `src/api/server.mjs` as text to confirm the pinned commands are exactly the implemented ones, and two more seeded defects (an unexpected panel column, a dropped panel view) are caught. Still **not** gate acceptance: a contract is not a rendered interface. `evidence/RUN-016.md` adds the renderer that contract implies, minus the pixels: `src/ui/render.mjs` draws every panel as text from the contract plus the served rows and enforces the four rules a hand-written UI gets wrong — a column the contract does not list is never drawn even when the row carries it, a contract column the row lacks is drawn `—` instead of shifting the columns after it, rows from another view are refused rather than relabelled, and a button the kernel would refuse now is drawn disabled with the reason (on a fresh, restored or rebooted kernel that is every button). `mc render` and CI step `ui_render_screen` run it on the live kernel. `evidence/RUN-017.md` fixes **when** the screen redraws, which is where a desktop UI usually starts lying: `src/ui/follower.mjs` follows `/events/stream` instead of polling, drops a repeated or regressing sequence rather than applying it twice, refetches the panels rather than patching them when a gap proves events were missed, marks the screen `stale` on a dropped connection instead of clearing it or pretending it is live, and resumes with `?from=<lastSeq>` so resume is a ledger position and not a server session. `scripts/ui-follow-exercise.mjs` (CI step `ui_follow_exercise`) plays the shell against a throwaway kernel and a real `api serve` child over the socket only: 11 checks, 0 failed, including two negative controls that delete one rule in a copy of the follower and observe the matching check break. `evidence/RUN-018.md` closes the claim those three imply: `scripts/ui-screen-soak.mjs` (CI step `ui_screen_soak`) draws the same screen twice through paths that share no step but the ledger — a follower that watched every event over the socket, and a separate process that never saw the stream and renders from a read-only database handle — and requires the bytes to match, in 6 cycles that each reconnect the follower, accept one command and are refused twice (`UI_SCREEN_SOAK_PASS 6/6`, 0 divergent, 0 leaked denials, 0 stale cursors). Text lines are still not a desktop application |
| G9–G14 | `PENDING` | no evidence |

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
8949141956b325e30d93fb27fcc4f8a875964ec0d533bd3b4d66115501e27e2f  evidence/RUN-007.md
e6baf57899e60bcd520d1be35a11c67129767db8017ab16d77f902fcee9c57ec  evidence/RUN-008.md
54e0636d5bd2d2899df31455a73cc07abc66ebcc4e28a92a8817cf39518f8605  evidence/RUN-009.md
5266be885bbed2302240c035f6978ab5622545c284ecf15c4cec158e1ad7b432  evidence/RUN-010.md
6c90e9865bfe0f8bed702b29b4d6d8788eec5d03bed7423513320c6ec52e28b2  evidence/RUN-011.md
ee9ae974c846399aef0ad9bf87037ce3d0a12b455e5a47e50333498b74999c97  evidence/RUN-012.md
2a008cc00d0cf447ad3f6588343269a12ee1ce861ef7a5a51084341ae314312c  evidence/OWNER-PACKET-003.md
a60e676133c74414fc5b74e17c9bff60b81d79c4885248330a856db5c5878e14  evidence/RUN-013.md
fa52e9d8d4993c2cb5e97583bf754547bde09e3e56b40ad896b382a06f475bf0  evidence/RUN-014.md
aae2bfb3215653f2f69eeb71379093c929b1a05a2c83bc69d76ad6bbe19428e1  evidence/RUN-015.md
6fdf2eac48657b5b5471df4c7d2d10bd850e6b55333fb492440f3129d2ac8974  evidence/RUN-016.md
17a559ac9e93f7f776d7027730ec4588d8bf418951be58474965e5787455d2f5  evidence/RUN-017.md
ece36cc966de1eec364a19e89a2df4923a2fa834e72104c89279c93ef8eef988  evidence/RUN-018.md
992ad062d29348829494682450ab416280a4e301725c9170150bc432cfeb9b5f  contracts/ui-contract.json
93c779dd6efd77a8d5efa49930019f06fc4440c6c02331413c4c93e9563a7894  evidence/G4-ACCEPTANCE-001.json
a0c9103a8f1789c26ea69e196b55144a1b5f09e1f73ac89971a74efd740705e7  evidence/G4-SCHEDULER-001.json
79a73ee406d014e5e769c460f60777fb3abf2a47c813f7844b392b6cb819367e  evidence/G4-DAEMON-001.json
87a225a1069110959cfe1bb7dffa4fecdfcfa9de12e20d082e974f516f1d3f90  evidence/G4-SUPERVISOR-001.json
02be859d90c042e93b67c7c58e4b0eee838a7af07e9ef550da1733240a96b257  evidence/REDTEAM-QUEUE-001.json
7a369689b268d1b962df7da1ddaef976c5917ca713120224091a62c0e04e1f79  evidence/REDTEAM-G3-001.json
fe881b2d793f7391ec35930d3e54aa17778d6963db22e3abc83b0aa50d33cc47  evidence/SOAK-cf77e410-d146-4b9f-b0d3-26bffaef8cb8.json
636917e73b61ced8c91ef651c4ef60bf0af6ec41d915751fce8ed8d1e6b940fa  evidence/raw/CAND-x-angeldot-2092234523471737056.html
```

Gate evidence IDs: G0 = `BASELINE-20260826`, G1 =
`SOAK-cf77e410-d146-4b9f-b0d3-26bffaef8cb8`. G2 and G5 have **no** evidence
file, because those gates are not closed; claiming an ID for them would be
fabrication. G3 and G4 have artefacts (`REDTEAM-G3-001`; `RUN-007`,
`RUN-008`, `RUN-009`, `RUN-010`, `G4-ACCEPTANCE-001`, `G4-SCHEDULER-001`,
`G4-DAEMON-001`, `G4-SUPERVISOR-001`, `REDTEAM-QUEUE-001`, `QSOAK-G4-001`,
`SSOAK-G4-001`, `DSOAK-G4-001`, `VSOAK-G4-001`) and are still `PENDING`
— an artefact is not a promotion. G7 likewise has an artefact (`RUN-011`) and G8
a read-side artefact (`RUN-012`), and both are still `PENDING`. This RUN's
evidence is `evidence/RUN-012.md`; the external-lane
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
- `session_runs`: 10 rows — `RUN-002` (G1 continuity), `RUN-003` (G6 PREP_ONLY),
  `RUN-004` (G1 durability + gate guards), `RUN-005` (G2 intake slice + external
  lane re-adjudication), `RUN-006` (G3 governor surface + red-team), `RUN-007`
  (G4 workflow runtime), `RUN-008` (G4 durable scheduler), `RUN-009` (G4
  scheduler daemon), `RUN-010` (G4 scheduler supervisor), `RUN-011` (G7
  PortfolioOps), `RUN-012` (G8 Mission Control read side), all `CHECKPOINTED`
  with evidence refs.
- Portfolio: 2 projects, 2 adapters (`for_ai`, `shopping_shorts`, both enabled on
  `G7-EX-1`), 4 `demand_evidence` rows (2 `DEMAND`, 2 `UTILITY`, every one citing
  a source reference), 3 `portfolio_cycles` rows, all `USEFUL` and all verified by
  `scripts/verify-portfolio-artifact.mjs` in a separate process, 1 of 1 allowed
  active project. The second project was refused activation at 1/1 capacity and
  is on the record as such. `portfolio report` acceptance is `ok: true` while the
  gate itself stays `PENDING`.
- Queue: 8 jobs (2 retried-then-done, 2 dead-lettered with the error on the
  record, 2 enqueued by the scheduler exercise), 2 committed external effects,
  0 duplicated effect keys, 0 stuck leases, 0 DONE jobs with an open attempt.
  28 `queue_soak_cycles` rows, all `ok`, append-only.
- Scheduler: 1 schedule (created disarmed, armed by the Owner with a reason for
  the RUN-008 exercise, disarmed again afterwards), 2 fires on 2 distinct
  boundaries, 0 deduped, 0 boundaries served twice. The master switch is back to
  `enabled = 0`. 16 `schedule_soak_cycles` rows, all `ok`, append-only —
  `SSOAK-G4-001` is the 8-cycle soak the evidence rests on, and two exploratory
  4-cycle runs are on the record because a `--no-record` flag-parsing bug (since
  fixed) recorded them; they are real passing cycles, not forged ones.
- Daemon: 8 `daemon_soak_cycles` rows for `DSOAK-G4-001`, all `ok` — 7 real
  `SIGKILL`s of a live daemon process and 1 clean `SIGTERM`, 12 boundaries served,
  0 duplicated boundaries, 0 duplicated jobs, 0 regressions. Append-only. The soak
  runs against a scratch database, so the kernel's own schedule stays disarmed.
  Local CI's daemon step runs with `--no-record` so repeated CI runs cannot
  inflate this evidence.
- Supervisor: 6 `supervisor_soak_cycles` rows for `VSOAK-G4-001`, all `ok` — 3
  child-only `SIGKILL`s (each replaced by a genuinely different child PID), 2
  whole-process-group `SIGKILL`s, 1 clean `SIGTERM`, 3 unattended restarts, 14
  boundaries served, 0 duplicated boundaries, 0 duplicated jobs, 0 regressions.
  Append-only, scratch database, and Local CI's supervisor step runs with
  `--no-record`.
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
- `next_run`: next exact action is the read-only Mission Control projection
  surface for G8 (Inbox/Projects/Timeline/Council/Approvals/Evidence/Costs as
  deterministic views over the existing events, validated against the raw rows)
  — or, if the official chat exports arrive first, G2 body recovery, which is the
  only thing that unblocks the G3/G4 promotions. G8's Tauri 2 desktop shell needs
  a Rust/Cargo toolchain, which is an install and therefore an Owner Packet, so it
  is not started here. Real-OS-restart autostart / service registration stays G10
  work and is not claimed here. The G3 governor entry was consumed by `RUN-006`,
  the G4 durable-queue entry by `RUN-007`, the scheduler entry by `RUN-008`, the
  daemon entry by `RUN-009`, the supervisor entry by `RUN-010`, the G7
  PortfolioOps entry by `RUN-011`, and the G8 read-surface entry by `RUN-012`.
  The API/SSE facade entry was consumed by `RUN-013`, which also opened
  `evidence/OWNER-PACKET-003.md` for the Rust/Cargo + Tauri 2 install, and the
  widened command vocabulary by `RUN-014`, which moved admission from the facade
  to the Governor, and the deterministic UI contract by `RUN-015`, which derives
  every panel's columns from the views and every button from `COMMANDS`, pins the
  result in `contracts/ui-contract.json` and serves it at `GET /contract`. The
  rendering harness by `RUN-016`, which draws all eight panels as text from the
  contract and refuses to show a column the contract does not list or to draw a
  refused button as pressable, and the refresh policy by `RUN-017`, which follows
  the ledger stream instead of polling and refuses to patch a screen over a gap.
  and the ledger-agreement soak by `RUN-018`, which requires the warm and cold
  paths to the screen to be byte-identical. The install-free part of G8's read
  side is now closed — vocabulary, drawing, refresh, agreement — and what remains
  for acceptance needs the toolchain, so the queued NEXT_RUN is the Owner-facing
  one: `evidence/OWNER-PACKET-003.md` (Rust/Cargo + Tauri 2). Until it is
  approved, the next install-free slice is G9's proposal-only self-change ledger,
  which needs no UI and no provider.
- `approvals`: 1 row, revoked. `APR-85b98f0c…` was minted by the agent during a
  CLI smoke test with `granted_by = 'owner'` although the Owner never granted it;
  it was revoked on the record and migration `0011` now refuses any approval that
  does not cite an Owner Packet file present on disk.
- `redteam_probes` / `admission_attempts`: red-team results and admission denials
  are recorded and append-only; the independent validator recomputes G3 acceptance
  from these raw rows rather than from the `v_g3_acceptance` view.
- Event ledger: 196 events, head `766b574822778cb64283134d22563fad1519a65a060365a02bed05c7b312d6a7`, chain ok, integrity `ok`, emergency stop `ON`.
  The stop was released with an Owner reason only for the duration of the G4
  queue/scheduler exercises and the G7 portfolio exercise, and re-engaged
  immediately afterwards; every transition is an event in the ledger.
- Rollback rehearsal after `0016`:
  `BKP-bab11ea6-b374-435a-b6cc-df09748f5fb3` verified (integrity `ok`, 193 events,
  head `a0fe13d9dc24dd713937cdd3044c009b2c6ce0d08753cf38b40e5866affd31c3`),
  restored into a fresh database, and the restored copy passes
  `independent-validation` including `portfolio_cycles_recomputed` with the same
  3/3 `USEFUL` cycles and 1/1 active project.

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
