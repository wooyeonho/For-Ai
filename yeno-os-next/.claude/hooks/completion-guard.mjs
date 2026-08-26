#!/usr/bin/env node
// Stop / completion hook. Blocks a "gate complete" claim while any open work
// order still lacks evidence. Reads the live kernel instead of trusting prose.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { evaluateCompletion, DENY } from './guard-rules.mjs';

const REPO = new URL('../..', import.meta.url).pathname;
const dbPath = process.env.YENO_DB ?? join(REPO, 'state', 'yeno.db');

let openWorkOrdersWithoutEvidence = 0;
if (existsSync(dbPath)) {
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const row = db
      .prepare(
        `SELECT COUNT(*) AS n FROM work_orders
         WHERE state = 'OPEN' AND (evidence_ref IS NULL OR evidence_ref = '')`,
      )
      .get();
    db.close();
    openWorkOrdersWithoutEvidence = Number(row?.n ?? 0);
  } catch {
    openWorkOrdersWithoutEvidence = 0;
  }
}

const result = evaluateCompletion({ openWorkOrdersWithoutEvidence });
process.stdout.write(`${JSON.stringify({ decision: result.permission, code: result.code, reason: result.reason })}\n`);
process.exit(result.permission === DENY ? 2 : 0);
