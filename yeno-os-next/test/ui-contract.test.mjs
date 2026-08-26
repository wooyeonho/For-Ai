// The UI contract. The property under test is that the shell's vocabulary is
// derived from the kernel and pinned: a panel cannot quietly grow a column, and a
// button cannot exist for something the API would refuse.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { freshDb } from './helpers.mjs';
import { uiContract } from '../src/domain/ui-contract.mjs';
import { COMMANDS } from '../src/api/server.mjs';
import { PANELS, panel } from '../src/domain/mission-control.mjs';
import { sha256Json } from '../src/core/hash.mjs';

const PINNED = new URL('../contracts/ui-contract.json', import.meta.url).pathname;

test('the contract describes every panel with the columns its view really has', () => {
  const ctx = freshDb();
  try {
    const contract = uiContract(ctx.db, COMMANDS);
    assert.deepEqual(Object.keys(contract.panels).sort(), [...PANELS].sort());
    for (const name of PANELS) {
      const entry = contract.panels[name];
      const live = ctx.db.prepare('SELECT name FROM pragma_table_info(?)').all(entry.view);
      assert.deepEqual(
        entry.columns,
        live.map((r) => r.name),
        `${name} columns drifted from ${entry.view}`,
      );
      assert.ok(entry.columns.length > 0);
      // The panel must actually answer with the columns it advertises.
      const drawn = panel(ctx.db, name, { limit: 1 });
      assert.equal(drawn.view, entry.view);
    }
  } finally {
    ctx.cleanup();
  }
});

test('every action is a real command and no panel can offer approval granting', () => {
  const ctx = freshDb();
  try {
    const contract = uiContract(ctx.db, COMMANDS);
    for (const [name, entry] of Object.entries(contract.panels)) {
      for (const action of entry.actions) {
        const spec = COMMANDS[action.command];
        assert.ok(spec, `${name} offers unknown command ${action.command}`);
        // Authority is the kernel's, not the panel's.
        assert.equal(action.authority, spec.authority);
        assert.ok(!/grant/.test(action.command));
      }
    }
    // Read-only panels stay read-only: the ledger and the record have no buttons.
    for (const name of ['timeline', 'evidence', 'projects', 'council', 'costs']) {
      assert.deepEqual(contract.panels[name].actions, []);
    }
    // Every command the API knows is listed, so a new one cannot hide by being
    // attached to no panel.
    assert.deepEqual(Object.keys(contract.commands).sort(), Object.keys(COMMANDS).sort());
  } finally {
    ctx.cleanup();
  }
});

test('the contract hash is pinned and covers the panels and the commands', () => {
  const ctx = freshDb();
  try {
    const contract = uiContract(ctx.db, COMMANDS);
    const pinned = JSON.parse(readFileSync(PINNED, 'utf8'));
    assert.equal(
      contract.contract_hash,
      pinned.contract_hash,
      'the kernel and contracts/ui-contract.json disagree; run scripts/pin-ui-contract.mjs',
    );

    // The hash is over the contract body, so touching either half moves it.
    const { contract_hash: _drop, ...body } = contract;
    assert.equal(sha256Json(body), contract.contract_hash);

    const withNewColumn = structuredClone(body);
    withNewColumn.panels.inbox.columns.push('owner_mood');
    assert.notEqual(sha256Json(withNewColumn), contract.contract_hash);

    const withNewAction = structuredClone(body);
    withNewAction.panels.evidence.actions.push({ command: 'evidence.delete', authority: 'A2' });
    assert.notEqual(sha256Json(withNewAction), contract.contract_hash);
  } finally {
    ctx.cleanup();
  }
});
