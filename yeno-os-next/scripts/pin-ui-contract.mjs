#!/usr/bin/env node
// Pins the UI contract. `--check` (used by local CI) regenerates the contract from
// a throwaway kernel and compares it with contracts/ui-contract.json, so a panel
// that grows a column, or a command that appears or disappears, fails until the
// change is pinned on purpose.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from '../src/core/migrate.mjs';
import { openDb } from '../src/core/db.mjs';
import { uiContract } from '../src/domain/ui-contract.mjs';
import { COMMANDS } from '../src/api/server.mjs';

const TARGET = new URL('../contracts/ui-contract.json', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'yeno-ui-contract-'));

let contract;
try {
  const db = openDb(join(dir, 'yeno.db'));
  migrate(db);
  contract = uiContract(db, COMMANDS);
  db.close();
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const check = process.argv[2] === '--check';
if (check) {
  if (!existsSync(TARGET)) {
    process.stderr.write('UI_CONTRACT_PIN_FAIL: contracts/ui-contract.json is missing\n');
    process.exit(1);
  }
  const pinned = JSON.parse(readFileSync(TARGET, 'utf8'));
  if (pinned.contract_hash !== contract.contract_hash) {
    process.stderr.write(
      `UI_CONTRACT_PIN_FAIL: pinned ${pinned.contract_hash} but the kernel now describes ${contract.contract_hash}\n` +
        'A panel column or a command changed. Review it, then re-run without --check.\n',
    );
    process.exit(1);
  }
  const panels = Object.keys(contract.panels).length;
  const actions = Object.values(contract.panels).reduce((n, p) => n + p.actions.length, 0);
  process.stdout.write(
    `UI_CONTRACT_PIN_OK: ${panels} panels, ${Object.keys(contract.commands).length} commands, ${actions} panel actions\n`,
  );
  process.exit(0);
}

writeFileSync(TARGET, `${JSON.stringify(contract, null, 2)}\n`);
process.stdout.write(`pinned ui contract ${contract.contract_hash} -> ${TARGET}\n`);
