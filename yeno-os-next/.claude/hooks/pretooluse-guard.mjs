#!/usr/bin/env node
// PreToolUse hook. Reads the hook payload on stdin and emits a permission
// decision. Fails closed: any error becomes a deny, never a silent allow.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { evaluateToolUse, DENY } from './guard-rules.mjs';

const REPO = new URL('../..', import.meta.url).pathname;

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function appliedMigrations() {
  const dbPath = process.env.YENO_DB ?? join(REPO, 'state', 'yeno.db');
  if (!existsSync(dbPath)) return [];
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const rows = db.prepare('SELECT filename FROM schema_migrations').all();
    db.close();
    return rows.map((r) => r.filename);
  } catch {
    return [];
  }
}

function emit(decisionResult, exitCode) {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: decisionResult.permission,
        permissionDecisionReason: `[${decisionResult.code}] ${decisionResult.reason}`,
      },
    })}\n`,
  );
  process.exit(exitCode);
}

let payload;
try {
  payload = JSON.parse(readStdin() || '{}');
} catch (err) {
  emit({ permission: DENY, code: 'UNPARSEABLE_PAYLOAD', reason: String(err.message) }, 2);
}

let result;
try {
  result = evaluateToolUse(payload, { appliedMigrations: appliedMigrations() });
} catch (err) {
  emit({ permission: DENY, code: 'GUARD_ERROR', reason: String(err.message) }, 2);
}

emit(result, result.permission === DENY ? 2 : 0);
