#!/usr/bin/env node
/**
 * The screen's acceptance spec: two independent paths to the same screen.
 *
 * A UI is trustworthy when it cannot disagree with the ledger. That is testable
 * without pixels by drawing the same screen twice, through paths that share no
 * step but the ledger itself:
 *
 *   warm path — a follower that watched every event arrive on `/events/stream`,
 *               then redrew from `/contract` + `/panels` over the socket;
 *   cold path — a separate process that never saw the stream, opens the database
 *               read-only and renders (`mc render`).
 *
 * At the same ledger head the two must be **byte-identical**. Any divergence is
 * either a projection that depends on how it was reached or a screen holding
 * state the ledger does not have, and both are the failure the read side exists
 * to prevent.
 *
 * Each cycle also reconnects the follower and mixes an accepted command with one
 * the Governor refuses, so the comparison is made on a screen that has just seen
 * a denial — the case where a UI is most tempted to show its own optimistic
 * guess.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { argv, execPath } from 'node:process';
import { renderScreen } from '../src/ui/render.mjs';
import { Follower } from '../src/ui/follower.mjs';

const REPO = new URL('..', import.meta.url).pathname;
const CLI = join(REPO, 'src/cli.mjs');
const TOKEN = 'screen-soak-token-0123456789';
const CYCLES = Number(argv.find((a) => a.startsWith('--cycles='))?.split('=')[1] ?? 6);
const LIMIT = 5;

const dir = mkdtempSync(join(tmpdir(), 'yeno-screen-soak-'));
const dbPath = join(dir, 'yeno.db');
const env = { ...process.env, YENO_DB: dbPath };

const cycles = [];

function cli(args, { allowFailure = false } = {}) {
  const out = spawnSync(execPath, [CLI, ...args], { env, encoding: 'utf8' });
  if (out.status !== 0 && !allowFailure) {
    throw new Error(`cli ${args.join(' ')} failed: ${out.stderr || out.stdout}`);
  }
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
  // The stop is released on this throwaway kernel only, with a reason on the
  // record, so commands can be accepted at all. The kernel is deleted at the end.
  cli(['stop', 'release', '--reason', 'screen acceptance soak on a throwaway kernel']);

  const { child, base } = await serve();
  const call = (path, init = {}) =>
    fetch(`${base}${path}`, {
      ...init,
      headers: { 'x-yeno-token': TOKEN, 'content-type': 'application/json', ...(init.headers ?? {}) },
    });
  const command = (name, payload) =>
    call('/command', { method: 'POST', body: JSON.stringify({ command: name, payload }) });

  try {
    for (let cycle = 1; cycle <= CYCLES; cycle += 1) {
      // A fresh connection every cycle: the shell is reconnecting, as it would
      // after a sleep, a network blip or a restart of the facade.
      const follower = new Follower({ from: cycle === 1 ? 0 : cycles.at(-1).head });
      const stream = await call(`/events/stream${follower.resumeQuery()}`);
      const reader = stream.body.getReader();
      const reopened = follower.open();

      const accepted = await command('self.remember', {
        kind: 'EPISODIC',
        content: `screen soak cycle ${cycle}`,
        source_ref: 'test://screen-soak',
        confidence: 0.9,
      });
      // Two refusals per cycle, so the screen is compared right after being told
      // "no": granting an approval is not in the vocabulary at all, and promoting
      // an inbox item that does not exist is refused by the domain. Neither may
      // leave a trace on the screen.
      const unknown = await command('approval.grant', { scope: 'anything' });
      const refused = await command('inbox.promote', {
        inbox_id: `no-such-inbox-${cycle}`,
        code: `SOAK-${cycle}`,
        name: 'a project the kernel never admitted',
      });

      let sawAccepted = false;
      let refetch = false;
      while (!sawAccepted) {
        const { value, done } = await reader.read();
        if (done) break;
        const step = follower.feed(Buffer.from(value).toString('utf8'));
        refetch = refetch || step.refetch;
        sawAccepted = step.events.some((e) => e.type === 'api.command.accepted');
      }

      // Warm path: the screen a shell that followed the stream would draw.
      const contract = await (await call('/contract')).json();
      const served = await (await call(`/panels?limit=${LIMIT}`)).json();
      const stopOn = served.panels.settings.rows[0].emergency_stop_engaged === 1;
      const refusals = stopOn
        ? Object.fromEntries(
            Object.values(contract.panels).flatMap((p) => p.actions.map((a) => [a.command, 'EMERGENCY_STOP'])),
          )
        : {};
      const warm = renderScreen(contract, served.panels, { refusals }).join('\n');

      // Cold path: a separate process that never saw the stream.
      const cold = cli(['mc', 'render', '--limit', String(LIMIT)]).trimEnd();

      const head = Number(JSON.parse(cli(['status', '--json'])).events?.head_seq ?? follower.lastSeq);
      cycles.push({
        cycle,
        head,
        cursor: follower.lastSeq,
        accepted: accepted.status,
        denied: `${unknown.status}/${refused.status}`,
        deniedStatuses: [unknown.status, refused.status],
        reopened: reopened.refetch,
        refetch,
        identical: warm === cold,
        warmLines: warm.split('\n').length,
        coldLines: cold.split('\n').length,
      });
      await reader.cancel();
      follower.dropped('CYCLE_END');
    }
  } finally {
    child.kill('SIGTERM');
  }

  const divergent = cycles.filter((c) => !c.identical);
  const badAccept = cycles.filter((c) => c.accepted !== 202);
  const badDeny = cycles.filter((c) => c.deniedStatuses.some((s) => s < 400));
  const stalePath = cycles.filter((c) => c.cursor < c.head - 1);

  for (const c of cycles) {
    console.log(
      `cycle ${c.cycle}: head ${c.head}, cursor ${c.cursor}, accepted ${c.accepted}, denied ${c.denied}, ` +
        `identical ${c.identical} (${c.warmLines} lines)`,
    );
  }
  console.log(
    `screen soak cycles: ${cycles.length}, divergent screens: ${divergent.length}, ` +
      `bad accepts: ${badAccept.length}, leaked denials: ${badDeny.length}, stale cursors: ${stalePath.length}`,
  );

  rmSync(dir, { recursive: true, force: true });

  if (divergent.length > 0 || badAccept.length > 0 || badDeny.length > 0 || stalePath.length > 0) {
    console.log('UI_SCREEN_SOAK_FAIL');
    process.exit(1);
  }
  console.log(`UI_SCREEN_SOAK_PASS ${cycles.length}/${cycles.length}`);
}

await main();
