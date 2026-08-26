/**
 * The UI contract (G8).
 *
 * The desktop shell does not exist yet, but what it is allowed to show and to do
 * can already be fixed. This module derives that contract from the two things
 * that are actually true — the panel views in the database and the API's command
 * allowlist — and never from a hand-written list, so the contract cannot drift
 * away from the kernel by being forgotten.
 *
 * Two consequences the shell inherits for free:
 *
 *   - a column the views do not have cannot be displayed, because the contract
 *     enumerates the columns the views do have;
 *   - a button the kernel would refuse cannot be drawn, because every action is
 *     a name in `COMMANDS` and every panel's actions are a subset of it.
 *
 * The contract is hashed and pinned (`contracts/ui-contract.json`). A panel that
 * grows a column, or an action that appears or disappears, changes the hash and
 * fails CI until the change is looked at deliberately.
 */
import { sha256Json } from '../core/hash.mjs';
import { PANELS } from './mission-control.mjs';

/**
 * Which actions each panel may offer. Read-only panels are read-only on purpose:
 * the Timeline is the ledger and the Evidence panel is the record, so neither
 * gets a button that would edit history.
 */
const PANEL_ACTIONS = {
  inbox: ['inbox.promote'],
  projects: [],
  timeline: [],
  council: [],
  approvals: ['approval.revoke'],
  evidence: [],
  costs: [],
  settings: ['self.observe'],
};

const VIEW_OF = {
  inbox: 'v_mc_inbox',
  projects: 'v_mc_projects',
  timeline: 'v_mc_timeline',
  council: 'v_mc_council',
  approvals: 'v_mc_approvals',
  evidence: 'v_mc_evidence',
  costs: 'v_mc_costs',
  settings: 'v_mc_settings',
};

function columnsOf(db, view) {
  const rows = db.prepare(`SELECT name FROM pragma_table_info(?)`).all(view);
  if (rows.length === 0) throw new Error(`UI_CONTRACT: view ${view} has no columns`);
  return rows.map((r) => r.name);
}

/**
 * Build the contract from the live database and the API's command table. The
 * table is passed in rather than imported so that the facade can serve its own
 * contract without this module and the facade importing each other. Read-only:
 * it runs happily on a `readOnly: true` handle, which is how the CLI serves it.
 */
export function uiContract(db, COMMANDS) {
  const panels = {};
  for (const name of PANELS) {
    const view = VIEW_OF[name];
    if (!view) throw new Error(`UI_CONTRACT: panel ${name} has no view`);
    const actions = PANEL_ACTIONS[name] ?? [];
    for (const action of actions) {
      // A panel cannot offer an action the API would not accept.
      if (!COMMANDS[action]) throw new Error(`UI_CONTRACT: panel ${name} offers unknown action ${action}`);
    }
    panels[name] = {
      view,
      columns: columnsOf(db, view),
      actions: actions.map((action) => ({ command: action, authority: COMMANDS[action].authority })),
    };
  }
  const contract = {
    version: 1,
    transport: { bind: '127.0.0.1', token_header: 'x-yeno-token', stream: '/events/stream' },
    panels,
    // Every command the API knows, including the ones no panel offers, so that a
    // new command cannot appear unnoticed by staying off every panel.
    commands: Object.fromEntries(
      Object.entries(COMMANDS)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, spec]) => [name, { authority: spec.authority }]),
    ),
  };
  return { ...contract, contract_hash: sha256Json(contract) };
}

export function uiContractHash(db, commands) {
  return uiContract(db, commands).contract_hash;
}
