# OWNER PACKET 002 — Codex CLI install (+ push of RUN-003)

Authority requested: A3 (approved, bounded external action). Two decisions, both
reversible. Nothing below has been executed.

## A. Current state — measured, not assumed

```text
$ which codex claude npx
/home/ubuntu/.nvm/versions/node/v24.19.0/bin/npx

$ codex --version
bash: line 1: codex: command not found

$ ls -la /home/ubuntu/.codex
ls: cannot access '/home/ubuntu/.codex': No such file or directory
```

- Current version: **none — Codex CLI is not installed on this machine.**
- Install method currently in use: **none.** So this is an *install*, not an update.
- `/model` list: **does not exist yet.** There is no CLI to ask, so there is no
  model list and no provider stderr to report beyond the `command not found` above.
- `gpt-5.6-luna` is recorded as the Owner-designated target model. It will be
  selected through `/model` after the CLI exists; it is not being guessed at now.
- Claude Code CLI is also absent (`claude` is not on PATH).

## B. What I propose to run

Package identity, read from the public npm registry today (read-only, no spend):

- package `@openai/codex`
- `dist-tags.latest` = `0.149.1`, published `2026-08-24T00:32:45Z`
- previous minor `0.148.0`, published `2026-08-18T22:30:14Z`

Target version: **`0.148.0` (pinned).** `0.149.1` is only 2 days old; a version
published at least 7 days ago has had time for a bad release to be pulled. If you
prefer newest, say so and I use `0.149.1` instead.

```sh
# 1. install, pinned, user-local (no sudo, no system paths)
npm install -g @openai/codex@0.148.0

# 2. prove what landed
which codex
codex --version

# 3. record the model list and login state, verbatim, into evidence
codex --help
```

- Install location: the nvm-managed prefix
  `/home/ubuntu/.nvm/versions/node/v24.19.0/lib/node_modules` — inside my user
  account. No `sudo`, no system package manager, no PATH rewrite.
- Network: npm registry only.

## C. Cost

- Install: **0 KRW** (npm download).
- Login: Codex CLI sign-in uses your existing ChatGPT/OpenAI entitlement. I do
  not create an account, do not enter payment details, and do not run any
  billable prompt under this packet.
- First bounded live RUN (G5) is a **separate** approval with its own
  `cost_p90` estimate. This packet buys the binary and the `/model` listing only.

## D. Verification after install

1. `codex --version` → recorded verbatim in `evidence/CODEX-INSTALL-001.md`.
2. `codex login` → you complete the browser sign-in; I never handle credentials
   and never store a token in the DB, logs or prompts.
3. In the Codex TUI: `/model` → the full list is recorded verbatim, then
   `gpt-5.6-luna` is selected.
4. `/status` → recorded verbatim (account, model, workspace).
5. If `gpt-5.6-luna` is not offered by that version, I record the exact list and
   the exact error and stop. I do not substitute another model on my own.

## E. Rollback

```sh
npm uninstall -g @openai/codex
rm -rf ~/.codex          # only if you want the config gone too
```

Nothing else on the machine is touched, so uninstall returns the box to the state
in §A. The YENO kernel does not depend on the CLI existing; G5 simply stays
`BLOCKED_PROVIDER_ACCESS`.

## F. Second decision — push RUN-003

RUN-003 (G6 Functional Self, PREP_ONLY) is finished locally and unpushed:
`migrations/0005_functional_self.sql`, `src/domain/self.mjs`,
`test/functional-self.test.mjs`, `STATUS.md`, `evidence/RUN-003.md`, plus the
validator/CLI/status additions. 74/74 tests, local CI 10/10, independent
validation PASS, 8/8 seeded defects detected.

Requested: one commit on the existing branch
`devin/1787738184-yeno-os-next-g0` and a push to the existing PR
<https://github.com/wooyeonho/For-Ai/pull/513>.

- No new repository, no new branch, no amend, no force-push.
- Merge of PR #513 is **not** requested here; it stays a WAITING blocker.
- Rollback: the branch can be reset to `e482ddd`, or the PR closed unmerged.

## G. What continues without any approval

G1 soak harness, G2 local parser/vault slice (no semantic promotion), G3
governor operator surface and red-team evidence, G4 durable queue, and further
G6 PREP_ONLY work (world model, 10-question self-model corpus). None of these
need the CLI or a merge.
