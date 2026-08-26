# OWNER-PACKET-003 — Rust/Cargo + Tauri 2 toolchain install (G8 desktop shell)

- Date: 2026-08-26
- Requested by: builder lane in `wooyeonho/For-Ai`, subtree `yeno-os-next/`
- Authority requested: **install** (Owner approval required every time per CLAUDE.md §5)
- Status: `WAITING_OWNER`

## 1. What this unblocks and what it does not

CLAUDE.md §9 G8 requires the body half of Mission Control: Tauri 2 + React/TypeScript, tray,
Living Body, push-to-talk voice. Tauri 2 cannot build without a Rust/Cargo toolchain, which this
machine does not have.

The read surface (RUN-012) and the local API boundary (RUN-013) are already built and attacked
without any install. This packet only asks for the toolchain that turns them into a window.
Approving it does **not** promote G8: the gate still needs `UI↔event projection` agreement,
accessibility, the 8GB RAM profile and voice-confirmation evidence.

## 2. Exact commands to run if approved

On this Ubuntu build host (no Windows packaging in this step):

```sh
# 1. Rust toolchain, pinned, user-local (no sudo, no system package changes)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
  | sh -s -- -y --default-toolchain 1.83.0 --profile minimal --no-modify-path
export PATH="$HOME/.cargo/bin:$PATH"
rustc --version && cargo --version

# 2. Tauri CLI, pinned
cargo install tauri-cli --version 2.1.0 --locked

# 3. Linux webview build deps (this step needs sudo — Owner-run, or approved for me)
sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

Windows-side packaging (`YENO_SETUP.exe` / `YENO.exe` / `YENO_RECOVERY.exe`) is **G10** and needs a
Windows build host with MSVC Build Tools. That is a separate packet, not this one.

## 3. Cost, size, time

| Item | Estimate | Basis |
|---|---|---|
| Disk — `~/.cargo` + `~/.rustup` | ~1.5–2.5 GB | rustup minimal profile plus one toolchain |
| Disk — `cargo install tauri-cli` build | ~1–2 GB transient, ~50 MB kept | source build of the CLI |
| Disk — apt webview deps | ~300–500 MB | `libwebkit2gtk-4.1-dev` and friends |
| Disk — first `tauri build` target dir | ~2–4 GB | Rust debug + release artefacts |
| Wall time | 20–45 min | download plus one CLI compile on this VM |
| Money | ₩0 | all components are free and open source |
| Network | rustup.rs, crates.io, Ubuntu archives | no other egress |

Total steady-state footprint after a build: roughly **5–8 GB**. Confirm free space before
approving.

## 4. Rollback

```sh
rustup self uninstall -y        # removes ~/.rustup and ~/.cargo, including tauri-cli
rm -rf yeno-shell/src-tauri/target
sudo apt-get remove -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

Nothing in the kernel depends on the toolchain: `state/yeno.db`, migrations, tests and local CI
all run on Node alone. Removing Rust returns the repository to exactly its current behaviour, and
local CI stays green without it.

## 5. Risk

- **Supply chain.** `rustup` and `crates.io` are the official channels; versions are pinned
  (`1.83.0`, `tauri-cli 2.1.0`) rather than floating, so a later upstream change cannot silently
  alter the build.
- **sudo.** Only step 3 needs it, and only for Ubuntu-archive webview headers. If you prefer, run
  step 3 yourself and I will do steps 1–2 without sudo.
- **Scope creep.** The approval covers exactly the three commands above. Any further install
  (Node packages for the React side, signing tools, Windows toolchains) comes back as its own
  packet.

## 6. Alternatives if you would rather not install a Rust toolchain

1. **Keep going without a window.** The API boundary is done, so the read surface is already usable
   over `127.0.0.1`. I continue widening the command vocabulary and the Governor path; G8 stays
   `PENDING` on the shell.
2. **A plain local web UI instead of Tauri.** Static HTML/JS served from the existing facade — no
   Rust, no install. But CLAUDE.md §8 names Tauri 2 for the Windows body (tray, notifications,
   push-to-talk), so this would be an interim viewer, and G8 would still need the Tauri shell.

## 7. Decision requested

- [ ] Approve steps 1–3 as written (I run 1–2, and 3 with sudo)
- [ ] Approve steps 1–2 only; you run step 3
- [ ] Defer — I continue on the install-free slices in NEXT_RUN of `evidence/RUN-013.md`
