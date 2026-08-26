#!/usr/bin/env node
/**
 * The shell's loop, end to end, with no shell.
 *
 * A throwaway kernel is migrated, the facade is served as a separate process, and
 * this script plays the part of the desktop app: follow `/events/stream`, redraw
 * from `/contract` + `/panels`, and assert the three things a real UI must get
 * right —
 *
 *   1. before the Owner releases the stop, every button on the screen is drawn
 *      disabled (a fresh install, a restored backup and a reboot all start here);
 *   2. a command's effect reaches the screen only after its event arrives on the
 *      stream, never before, so the screen cannot be ahead of the ledger;
 *   3. dropping the connection marks the screen stale and reconnecting resumes
 *      from the last seen sequence without replaying it.
 *
 * It imports the renderer and the follower (that is what a shell would do) but
 * talks to the kernel only over the socket.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execPath } from 'node:process';
import { renderScreen } from '../src/ui/render.mjs';
import { Follower } from '../src/ui/follower.mjs';

const REPO = new URL('..', import.meta.url).pathname;
const CLI = join(REPO, 'src/cli.mjs');
const TOKEN = 'follow-exercise-token-0123456789';
const dir = mkdtempSync(join(tmpdir(), 'yeno-ui-follow-'));
const dbPath = join(dir, 'yeno.db');
const env = { ...process.env, YENO_DB: dbPath };

const checks = [];
function check(id, ok, detail = '') {
  checks.push({ id, ok });
  console.log(`${ok ? 'OK' : 'FAIL'} ${id}${detail ? ` — ${detail}` : ''}`);
}

function cli(args) {
  const out = spawnSync(execPath, [CLI, ...args], { env, encoding: 'utf8' });
  if (out.status !== 0) throw new Error(`cli ${args.join(' ')} failed: ${out.stderr || out.stdout}`);
  return out.stdout;
}

async function serve() {
  const child = spawn(execPath, [CLI, 'api', 'serve', '--port', '0', '--token', TOKEN, '--json'], {
    env,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const bound = await new Promise((resolve, reject) => {
    let buf = '';
    child.stdout.on('data', (c) => {
      buf += c;
      const m = buf.match(/"bound":\s*"([^"]+)"/);
      if (m) resolve(m[1]);
    });
    child.on('exit', (code) => reject(new Error(`server exited early: ${code}`)));
  });
  return { child, base: `http://${bound}` };
}

async function main() {
  cli(['migrate']);
  const { child, base } = await serve();
  const call = (path, init = {}) =>
    fetch(`${base}${path}`, {
      ...init,
      headers: { 'x-yeno-token': TOKEN, 'content-type': 'application/json', ...(init.headers ?? {}) },
    });

  const draw = async (refusals) => {
    const contract = await (await call('/contract')).json();
    const served = await (await call('/panels?limit=5')).json();
    return renderScreen(contract, served.panels, { refusals }).join('\n');
  };

  try {
    // 1. A fresh kernel is stopped, so the shell draws every button disabled.
    const stopped = await draw(
      Object.fromEntries(
        Object.values((await (await call('/contract')).json()).panels)
          .flatMap((p) => p.actions.map((a) => [a.command, 'EMERGENCY_STOP'])),
      ),
    );
    const buttons = [...stopped.matchAll(/^\[ ([a-z.]+) \]/gm)].map((m) => m[1]);
    check(
      'fresh_kernel_draws_every_button_disabled',
      buttons.length > 0 && buttons.every((c) => stopped.includes(`[ ${c} ] disabled: EMERGENCY_STOP`)),
      `${buttons.length} buttons`,
    );

    // 2. Follow the stream, then act, and check the screen only moves after the event.
    const follower = new Follower();
    const stream = await call(`/events/stream${follower.resumeQuery()}`);
    const reader = stream.body.getReader();
    follower.open();

    cli(['stop', 'release', '--reason', 'ui follow exercise on a throwaway kernel']);
    const accepted = await call('/command', {
      method: 'POST',
      body: JSON.stringify({
        command: 'self.remember',
        payload: {
          kind: 'EPISODIC',
          content: 'the shell followed the ledger instead of polling',
          source_ref: 'test://ui-follow',
          confidence: 0.9,
        },
      }),
    });
    check('command_accepted_after_owner_released_the_stop', accepted.status === 202, `status ${accepted.status}`);

    let sawCommand = false;
    let refetched = false;
    while (!sawCommand) {
      const { value, done } = await reader.read();
      if (done) break;
      const step = follower.feed(Buffer.from(value).toString('utf8'));
      refetched = refetched || step.refetch;
      sawCommand = step.events.some((e) => e.type === 'api.command.accepted');
    }
    check('command_event_reached_the_follower', sawCommand, `cursor ${follower.lastSeq}`);
    check('no_gap_forced_a_refetch_on_a_clean_stream', refetched === false);

    const live = await draw({});
    // The renderer pads and truncates cells to the contract's column width, so the
    // event type is matched by prefix rather than by its full name.
    check(
      'screen_shows_the_effect_only_after_its_event',
      /(^|\s)api\.command\.accep/m.test(live) && new RegExp(`(^|\\s)${follower.lastSeq}\\s`, 'm').test(live),
      `cursor ${follower.lastSeq} visible in the timeline`,
    );
    check(
      'released_stop_makes_the_buttons_pressable_again',
      live.includes('[ inbox.promote ] A2') && !live.includes('disabled: EMERGENCY_STOP'),
    );

    // 3. Drop the connection: stale, not cleared; resume without replaying.
    await reader.cancel();
    const banner = follower.dropped().banner;
    check('dropped_connection_marks_the_screen_stale', follower.stale && !follower.live, banner);

    const resumed = new Follower({ from: follower.lastSeq });
    check('reopening_refetches_before_believing_the_screen', resumed.open().refetch === true);
    const again = await call(`/events/stream${resumed.resumeQuery()}`);
    const r2 = again.body.getReader();
    await call('/command', {
      method: 'POST',
      body: JSON.stringify({
        command: 'self.observe',
        payload: { metric: 'waiting_blockers', value: 4 },
      }),
    });
    let fresh = [];
    while (fresh.length === 0) {
      const { value, done } = await r2.read();
      if (done) break;
      fresh = resumed.feed(Buffer.from(value).toString('utf8')).events;
    }
    check(
      'resume_delivers_only_events_after_the_last_seen_sequence',
      fresh.length > 0 && fresh.every((e) => e.seq > follower.lastSeq),
      `from ${follower.lastSeq} to ${resumed.lastSeq}`,
    );
    await r2.cancel();
  } finally {
    child.kill('SIGTERM');
    rmSync(dir, { recursive: true, force: true });
  }

  // A check that cannot fail proves nothing. Each control copies the follower,
  // deletes one rule in the copy, and asserts the matching check then breaks.
  // The production source is never patched and the copy is thrown away.
  for (const control of [
    {
      id: 'gap_detection_removed',
      find: 'if (frame.seq > this.lastSeq + 1) {',
      replace: 'if (false) {',
      broken: (mod) => {
        const f = new mod.Follower({ from: 10 });
        return f.feed(`id: 13\nevent: t\ndata: {}\n\n`).refetch === false;
      },
    },
    {
      id: 'replay_guard_removed',
      find: 'if (frame.seq <= this.lastSeq) {',
      replace: 'if (false) {',
      broken: (mod) => {
        const f = new mod.Follower({ from: 5 });
        return f.feed(`id: 5\nevent: t\ndata: {}\n\n`).events.length === 1;
      },
    },
  ]) {
    const copy = mkdtempSync(join(tmpdir(), 'yeno-follow-nc-'));
    try {
      const source = readFileSync(join(REPO, 'src/ui/follower.mjs'), 'utf8');
      if (!source.includes(control.find)) throw new Error(`control ${control.id}: guard text not found`);
      const patched = join(copy, 'follower.mjs');
      writeFileSync(patched, source.replace(control.find, control.replace));
      const mod = await import(`file://${patched}`);
      check(`negative_control_${control.id}`, control.broken(mod) === true, 'the check breaks with the rule removed');
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(`ui follow checks: ${checks.length}, failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log('UI_FOLLOW_EXERCISE_FAIL');
    process.exit(1);
  }
  console.log('UI_FOLLOW_EXERCISE_PASS');
}

await main();
