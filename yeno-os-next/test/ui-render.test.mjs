// The shell's acceptance test, written before the shell. The property under test
// is that a renderer obeying the contract cannot put on screen anything the
// kernel has not admitted: no invented column, no pressable refused button, no
// rows from a view the contract does not name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './helpers.mjs';
import { uiContract } from '../src/domain/ui-contract.mjs';
import { COMMANDS } from '../src/api/server.mjs';
import { PANELS, panel, panels } from '../src/domain/mission-control.mjs';
import { renderPanel, renderScreen, currentRefusals } from '../src/ui/render.mjs';

function screen(ctx, { emergencyStopOn = false } = {}) {
  const contract = uiContract(ctx.db, COMMANDS);
  const data = panels(ctx.db, { limit: 5 }).panels;
  const refusals = currentRefusals(ctx.db, contract, { emergencyStopOn });
  return { contract, data, lines: renderScreen(contract, data, { refusals }) };
}

test('every panel the contract promises is drawn, with its own columns as headers', () => {
  const ctx = freshDb();
  try {
    const { contract, lines } = screen(ctx);
    const text = lines.join('\n');
    for (const name of PANELS) {
      assert.match(text, new RegExp(`^${name.toUpperCase()}\\b`, 'm'), `${name} was not drawn`);
      for (const column of contract.panels[name].columns) {
        assert.ok(text.includes(column.slice(0, 18)), `${name} lost the ${column} header`);
      }
    }
    assert.ok(text.startsWith(`YENO Mission Control  contract ${contract.contract_hash.slice(0, 12)}`));
  } finally {
    ctx.cleanup();
  }
});

test('a value the contract does not know about cannot reach the screen', () => {
  const ctx = freshDb();
  try {
    const contract = uiContract(ctx.db, COMMANDS);
    const entry = contract.panels.inbox;
    const data = {
      panel: 'inbox',
      view: entry.view,
      total: 1,
      shown: 1,
      attention: 0,
      // A row carrying a field the views never had — the shape a stale or
      // tampered API response would take.
      rows: [{ ...Object.fromEntries(entry.columns.map((c) => [c, 'x'])), owner_mood: 'CONFIDENT' }],
    };
    const text = renderPanel('inbox', entry, data).join('\n');
    assert.equal(text.includes('owner_mood'), false);
    assert.equal(text.includes('CONFIDENT'), false);
  } finally {
    ctx.cleanup();
  }
});

test('a column the contract lists but the row lacks is drawn as missing, not skipped', () => {
  const ctx = freshDb();
  try {
    const contract = uiContract(ctx.db, COMMANDS);
    const entry = contract.panels.inbox;
    const rows = [Object.fromEntries(entry.columns.slice(1).map((c) => [c, 'x']))];
    const lines = renderPanel('inbox', entry, {
      panel: 'inbox', view: entry.view, total: 1, shown: 1, attention: 0, rows,
    });
    const header = lines[1].split(' ').filter(Boolean);
    const row = lines[2].split(' ').filter(Boolean);
    assert.equal(row[0], '—');
    assert.equal(header.length, row.length, 'a missing value must not shift the columns after it');
  } finally {
    ctx.cleanup();
  }
});

test('rows from a view the contract does not name are refused, not relabelled', () => {
  const ctx = freshDb();
  try {
    const contract = uiContract(ctx.db, COMMANDS);
    const foreign = panel(ctx.db, 'costs', { limit: 1 });
    assert.throws(
      () => renderPanel('inbox', contract.panels.inbox, foreign),
      /RENDER: inbox rows came from v_mc_costs/,
    );
  } finally {
    ctx.cleanup();
  }
});

test('while the kernel is stopped every button is drawn disabled with the reason', () => {
  const ctx = freshDb();
  try {
    // A fresh kernel is stopped by default, which is exactly the state a shell
    // meets on first launch, after a restore and after a reboot.
    const { contract, lines } = screen(ctx, { emergencyStopOn: true });
    const text = lines.join('\n');
    const buttons = Object.values(contract.panels).flatMap((p) => p.actions.map((a) => a.command));
    assert.ok(buttons.length > 0);
    for (const command of buttons) {
      assert.ok(text.includes(`[ ${command} ] disabled: EMERGENCY_STOP`), `${command} looked pressable`);
    }
    // Read-only panels have no controls at all, stopped or not.
    for (const name of ['timeline', 'evidence', 'projects', 'council', 'costs']) {
      assert.equal(new RegExp(`^\\[ `, 'm').test(renderPanel(name, contract.panels[name], panel(ctx.db, name, { limit: 1 })).join('\n')), false);
    }
  } finally {
    ctx.cleanup();
  }
});

test('the screen cannot silently drop a panel the contract promises', () => {
  const ctx = freshDb();
  try {
    const contract = uiContract(ctx.db, COMMANDS);
    const data = panels(ctx.db, { limit: 1 }).panels;
    delete data.approvals;
    assert.throws(() => renderScreen(contract, data), /RENDER: the contract promises approvals/);
  } finally {
    ctx.cleanup();
  }
});
