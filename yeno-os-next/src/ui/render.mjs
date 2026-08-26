/**
 * The shell's renderer, written before the shell (G8).
 *
 * A desktop UI is a program that turns kernel rows into pixels. The pixels need
 * Tauri, which needs a Rust toolchain this machine does not have, but the turning
 * does not: it needs the contract, the rows, and a rule about what to do when
 * they disagree. That rule is the whole point of this module, and it is the one
 * thing a hand-written UI always gets wrong.
 *
 *   - a column the contract does not list is never drawn, even if the row has it;
 *   - a column the contract lists but the row lacks is drawn as `—`, so a missing
 *     value looks missing instead of shifting the column after it;
 *   - a button whose command is not in the contract is not drawn at all;
 *   - a button the kernel would refuse right now is drawn disabled with the
 *     reason, because a button that looks pressable and is not teaches the Owner
 *     to distrust the screen.
 *
 * Text, not pixels: `renderPanel` returns lines. That makes the screen an
 * assertable value, so the acceptance test for the future shell can be run today
 * with no install at all.
 */

const MISSING = '—';

function cell(value) {
  if (value === null || value === undefined) return MISSING;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return String(value);
}

/**
 * One panel as lines of text. `entry` is the contract's panel entry, `data` is
 * what `panel()` or `GET /panel/:name` returned, `refusals` maps a command name
 * to the reason the kernel would refuse it now (e.g. the emergency stop).
 */
export function renderPanel(name, entry, data, { refusals = {}, width = 18 } = {}) {
  if (!entry) throw new Error(`RENDER: the contract has no panel ${name}`);
  if (data.view !== entry.view) {
    // The rows came from somewhere the contract does not describe: refuse to draw
    // rather than label foreign rows with this panel's headers.
    throw new Error(`RENDER: ${name} rows came from ${data.view}, contract says ${entry.view}`);
  }

  const columns = entry.columns;
  const lines = [];
  lines.push(`${name.toUpperCase()}  (${data.shown}/${data.total}${data.attention ? `, ${data.attention} need attention` : ''})`);
  lines.push(columns.map((c) => c.padEnd(width).slice(0, width)).join(' '));

  for (const row of data.rows) {
    // Only contract columns, in contract order. Anything else in the row is
    // invisible by construction; there is no code path that renders it.
    lines.push(columns.map((c) => cell(row[c]).padEnd(width).slice(0, width)).join(' '));
  }
  if (data.rows.length === 0) lines.push('(nothing yet)');

  for (const action of entry.actions) {
    const refusal = refusals[action.command];
    lines.push(
      refusal
        ? `[ ${action.command} ] disabled: ${refusal}`
        : `[ ${action.command} ] ${action.authority}`,
    );
  }
  return lines;
}

/** The whole screen: every contract panel, in contract order. */
export function renderScreen(contract, panelsData, { refusals = {} } = {}) {
  const lines = [`YENO Mission Control  contract ${contract.contract_hash.slice(0, 12)}`];
  for (const [name, entry] of Object.entries(contract.panels)) {
    const data = panelsData[name];
    if (!data) throw new Error(`RENDER: the contract promises ${name} but no rows were served`);
    lines.push('', ...renderPanel(name, entry, data, { refusals }));
  }
  return lines;
}

/**
 * What the kernel would refuse right now, for the buttons the contract allows.
 * Read-only: it asks the Governor's own state rather than guessing, so a disabled
 * button is disabled for the same reason the command would be denied.
 */
export function currentRefusals(db, contract, { emergencyStopOn }) {
  const refusals = {};
  if (emergencyStopOn) {
    for (const entry of Object.values(contract.panels)) {
      for (const action of entry.actions) refusals[action.command] = 'EMERGENCY_STOP';
    }
  }
  return refusals;
}
