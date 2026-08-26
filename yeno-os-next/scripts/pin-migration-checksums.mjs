#!/usr/bin/env node
// Regenerates migrations/CHECKSUMS.json. Only legitimate when a NEW migration
// file is added; changing an existing entry means an applied migration was
// edited, which CI rejects.
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listMigrations, MIGRATIONS_DIR } from '../src/core/migrate.mjs';

const target = join(MIGRATIONS_DIR, 'CHECKSUMS.json');
const existing = existsSync(target) ? JSON.parse(readFileSync(target, 'utf8')) : {};
const next = {};
const changed = [];

for (const m of listMigrations(MIGRATIONS_DIR)) {
  next[m.filename] = m.checksum;
  if (existing[m.filename] && existing[m.filename] !== m.checksum) changed.push(m.filename);
}

// --check verifies the pin file without writing, for CI.
if (process.argv[2] === '--check') {
  const problems = [];
  for (const [filename, checksum] of Object.entries(next)) {
    if (!existing[filename]) problems.push(`${filename} is not pinned`);
    else if (existing[filename] !== checksum) problems.push(`${filename} checksum drifted`);
  }
  for (const filename of Object.keys(existing)) {
    if (!next[filename]) problems.push(`${filename} is pinned but missing on disk`);
  }
  if (problems.length > 0) {
    process.stderr.write(`CHECKSUM_PIN_FAIL:\n- ${problems.join('\n- ')}\n`);
    process.exit(1);
  }
  process.stdout.write(`CHECKSUM_PIN_OK: ${Object.keys(next).length} migrations pinned\n`);
  process.exit(0);
}

if (changed.length > 0 && process.argv[2] !== '--allow-rewrite') {
  process.stderr.write(
    `REFUSED: these already-pinned migrations changed: ${changed.join(', ')}\n` +
      'Applied migrations are immutable. Add a new migration instead.\n',
  );
  process.exit(1);
}

writeFileSync(target, `${JSON.stringify(next, null, 2)}\n`);
process.stdout.write(`pinned ${Object.keys(next).length} migrations -> ${target}\n`);
