#!/usr/bin/env node
// Independent HTTP red team against the local facade. It imports nothing from
// `src/`: it starts the server the way a shell would (`yeno api serve`) on a
// throwaway kernel and then attacks it over the socket, so the verdict comes
// from observed responses rather than from the implementation's own beliefs.
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execPath } from 'node:process';

const REPO = new URL('..', import.meta.url).pathname;
const CLI = join(REPO, 'src/cli.mjs');
const TOKEN = 'redteam-token-0123456789abcdef';
const dir = mkdtempSync(join(tmpdir(), 'yeno-api-redteam-'));
const dbPath = join(dir, 'yeno.db');
const env = { ...process.env, YENO_DB: dbPath };

const probes = [];
function probe(id, expectation, actual) {
  const ok = expectation === actual;
  probes.push({ id, expected: expectation, actual, ok });
  console.log(`${ok ? 'REFUSED/OK' : 'LEAK'} ${id}: expected ${expectation}, got ${actual}`);
}

function cli(args) {
  const out = spawnSync(execPath, [CLI, ...args], { env, encoding: 'utf8' });
  if (out.status !== 0) throw new Error(`cli ${args.join(' ')} failed: ${out.stderr || out.stdout}`);
  return out.stdout;
}

async function serve(cliPath, dbFile) {
  const child = spawn(execPath, [cliPath, 'api', 'serve', '--port', '0', '--token', TOKEN, '--json'], {
    env: { ...process.env, YENO_DB: dbFile },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const bound = await new Promise((resolve, reject) => {
    let buf = '';
    child.stdout.on('data', (c) => {
      buf += c;
      const match = buf.match(/"bound":\s*"([^"]+)"/);
      if (match) resolve(match[1]);
    });
    child.on('exit', (code) => reject(new Error(`server exited early: ${code}`)));
  });
  return { child, base: `http://${bound}`, bound };
}

/**
 * A probe that cannot fail proves nothing. Each negative control copies the
 * sources, deletes one guard in the copy, and asserts that the matching probe
 * then leaks. Production sources are never patched and the copy is thrown away.
 */
async function negativeControl(id, { find, replace }, attack) {
  const copy = mkdtempSync(join(tmpdir(), 'yeno-api-nc-'));
  const dbFile = join(copy, 'yeno.db');
  try {
    cpSync(join(REPO, 'src'), join(copy, 'src'), { recursive: true });
    cpSync(join(REPO, 'migrations'), join(copy, 'migrations'), { recursive: true });
    const patchedPath = join(copy, 'src/api/server.mjs');
    const original = readFileSync(patchedPath, 'utf8');
    if (!original.includes(find)) throw new Error(`negative control ${id}: guard text not found`);
    writeFileSync(patchedPath, original.replace(find, replace));
    const patchedCli = join(copy, 'src/cli.mjs');
    spawnSync(execPath, [patchedCli, 'migrate'], { env: { ...process.env, YENO_DB: dbFile }, encoding: 'utf8' });
    const { child, base } = await serve(patchedCli, dbFile);
    try {
      probe(id, true, await attack(base));
    } finally {
      child.kill('SIGTERM');
    }
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
}

async function main() {
  cli(['migrate']);

  const { child, base, bound } = await serve(CLI, dbPath);
  probe('binds_loopback_only', true, bound.startsWith('127.0.0.1:'));

  const call = (path, init = {}) =>
    fetch(`${base}${path}`, {
      ...init,
      headers: { 'x-yeno-token': TOKEN, 'content-type': 'application/json', ...(init.headers ?? {}) },
    });
  const command = (body, headers) =>
    call('/command', { method: 'POST', body: JSON.stringify(body), headers });

  try {
    probe('anonymous_request', 401, (await fetch(`${base}/health`)).status);
    probe('forged_token', 401, (await call('/health', { headers: { 'x-yeno-token': 'x'.repeat(30) } })).status);
    probe(
      'foreign_origin',
      403,
      (await call('/health', { headers: { origin: 'https://evil.example' } })).status,
    );
    probe('invented_panel', 404, (await call('/panel/wallet')).status);
    probe('invented_route', 404, (await call('/vault')).status);

    // A fresh kernel is stopped by default, so every command must be refused
    // before any Owner reason exists on this machine.
    probe('command_while_stopped', 423, (await command({ command: 'self.observe', payload: { metric: 'waiting_blockers', value: 3 } })).status);

    cli(['stop', 'release', '--reason', 'api red team on a throwaway kernel']);

    probe('sql_as_command', 400, (await command({ command: 'db.exec', payload: { sql: 'DELETE FROM events' } })).status);
    probe('sql_in_known_command', 422, (await command({ command: 'self.observe', payload: { metric: "waiting_blockers'; DROP TABLE events;--", value: 1 } })).status);
    probe('missing_field', 400, (await command({ command: 'self.remember', payload: { kind: 'EPISODIC' } })).status);
    probe('unparseable_body', 400, (await call('/command', { method: 'POST', body: '{' })).status);
    probe('accepted_command', 202, (await command({ command: 'self.observe', payload: { metric: 'waiting_blockers', value: 3 } })).status);

    // The panel actions. Granting an approval is not in the vocabulary at all, and
    // the ones that are still answer to the domain rules behind them.
    probe('minting_an_approval', 400, (await command({ command: 'approval.grant', payload: { exact_action: 'anything', target: 'anywhere' } })).status);
    probe('cancelling_an_invented_job', 422, (await command({ command: 'run.cancel', payload: { job_id: 'JOB-does-not-exist', reason: 'because' } })).status);
    probe('promoting_an_invented_inbox_item', 422, (await command({ command: 'inbox.promote', payload: { inbox_id: 'INB-nope', code: 'PRJ-X', name: 'invented' } })).status);
    probe('projects_still_empty', 0, Number(JSON.parse(cli(['mc', 'panel', '--name', 'projects', '--json'])).rows.length));

    cli(['stop', 'engage', '--reason', 'restore fail-closed after the red team']);
    probe('command_after_re_engage', 423, (await command({ command: 'self.observe', payload: { metric: 'waiting_blockers', value: 2 } })).status);

    // Reads must stay readable and must never mutate: a GET flood is answered or
    // rate limited, never turned into a write.
    const before = Number(JSON.parse(cli(['status', '--json'])).event_ledger.count);
    let limited = 0;
    for (let i = 0; i < 200; i += 1) {
      if ((await call('/panel/settings')).status === 429) limited += 1;
    }
    probe('read_flood_is_rate_limited', true, limited > 0);
    const after = Number(JSON.parse(cli(['status', '--json'])).event_ledger.count);
    probe('read_flood_wrote_nothing', before, after);

  } finally {
    child.kill('SIGTERM');
  }

  await negativeControl(
    'negative_control_stop_guard_leaks_when_removed',
    { find: "if (decision.decision !== 'ALLOW') {", replace: 'if (false) {' },
    async (base) => {
      const res = await fetch(`${base}/command`, {
        method: 'POST',
        headers: { 'x-yeno-token': TOKEN, 'content-type': 'application/json' },
        body: JSON.stringify({ command: 'self.observe', payload: { metric: 'waiting_blockers', value: 7 } }),
      });
      return res.status === 202;
    },
  );

  await negativeControl(
    'negative_control_token_guard_leaks_when_removed',
    { find: "if (request.headers['x-yeno-token'] !== token) {", replace: 'if (false) {' },
    async (base) => (await fetch(`${base}/health`)).status === 200,
  );

  const failed = probes.filter((p) => !p.ok);
  console.log(`api red team probes: ${probes.length}, leaks: ${failed.length}`);
  if (failed.length > 0) {
    console.error(`API_RED_TEAM_FAIL: ${failed.map((p) => p.id).join(', ')}`);
    return 1;
  }
  console.log('API_RED_TEAM_PASS');
  return 0;
}

let code = 1;
try {
  code = await main();
} finally {
  rmSync(dir, { recursive: true, force: true });
}
process.exit(code);
