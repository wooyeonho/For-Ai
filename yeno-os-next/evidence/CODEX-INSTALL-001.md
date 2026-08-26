# CODEX-INSTALL-001 — Codex CLI install under OWNER-PACKET-002

- Approved by Owner: 2026-08-26, "둘 다 승인: Codex CLI 설치(@openai/codex@0.148.0 고정) + RUN-003을 PR #513에 push"
- Authority: A3 (approved bounded external action)
- Cost: 0 KRW. npm download only; no billable model call was made.

## 1. Before

```text
$ which codex
(no output)

$ codex --version
bash: line 1: codex: command not found

$ ls -la /home/ubuntu/.codex
ls: cannot access '/home/ubuntu/.codex': No such file or directory
```

## 2. Command executed, verbatim

```text
$ npm install -g @openai/codex@0.148.0

added 2 packages in 3s
```

Pinned to `0.148.0` (published 2026-08-18) rather than `latest` = `0.149.1`
(published 2026-08-24), so the version has had more than a week of exposure.

## 3. After

```text
$ which codex
/home/ubuntu/.nvm/versions/node/v24.19.0/bin/codex

$ codex --version
codex-cli 0.148.0

$ codex login status
Not logged in
(exit 1)
```

Install location is the nvm-managed user prefix
`/home/ubuntu/.nvm/versions/node/v24.19.0/lib/node_modules/@openai/codex`. No
sudo, no system package manager, no PATH rewrite.

Subcommands available in this version (from `codex --help`): `exec`, `review`,
`login`, `logout`, `mcp`, `plugin`, `mcp-server`, `app-server`,
`remote-control`, `completion`, `update`, `doctor`, `sandbox`, `debug`, `apply`,
`resume`, `archive`, `delete`, `migrate-rollouts`, `unarchive`, `fork`, `cloud`,
`exec-server`, `features`, `help`.

## 4. `/model` and `/status` — still pending, and why

`/model` and `/status` are slash commands inside the interactive TUI, and the TUI
requires an authenticated account. `codex login status` reports `Not logged in`,
so neither can be produced yet. This is not guessed around: the sign-in is an
Owner action.

Two ways to finish it:

- **ChatGPT sign-in (recommended):** `codex login` opens a browser flow that the
  Owner completes. I never handle the credential.
- **API key:** `codex login --with-api-key` writes the key into
  `~/.codex/auth.json` in plaintext. I did **not** do this: writing an org API
  key to disk is exactly the kind of secret-at-rest the contract forbids.

## 5. Model availability — confirmed without a billable call

`gpt-5.6-luna` was verified to exist against the account that owns
`secret:org:OPENAI_API_KEY`, using the read-only model listing endpoint. The key
was bound only into that process's environment; it was not written to any file,
log, prompt or the database.

```text
$ curl -s https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY"
n_models 126
luna_match ['gpt-5.6-luna']
gpt-5 family: gpt-5, gpt-5-codex, gpt-5.1-codex, gpt-5.1-codex-max,
gpt-5.1-codex-mini, gpt-5.2-codex, gpt-5.3-codex, gpt-5.4, gpt-5.5,
gpt-5.6-luna, gpt-5.6-sol, ...
```

- `gpt-5.6-luna` is present. It is treated as the Owner-designated target model,
  not as a name to be questioned.
- Listing models is billed at 0. No completion, no `codex exec`, no prompt was
  run: a bounded live RUN is a separate approval with its own `cost_p90`.

## 6. Gate impact

G5 stays `BLOCKED_PROVIDER_ACCESS`. The binary now exists and the target model is
confirmed, but a gate needs a bounded live RUN through the `AgentProvider`
contract, and that needs an authenticated session. The blocker narrows from
"Codex CLI is not installed" to "Codex CLI is not logged in".

## 7. Rollback

```sh
npm uninstall -g @openai/codex
rm -rf ~/.codex
```

The kernel does not depend on the CLI existing; removing it returns the machine
to §1 and leaves G5 exactly as it is now.
