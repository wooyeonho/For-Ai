#!/usr/bin/env node
// Independent verifier for one portfolio artefact.
//
// Deliberately does NOT import src/domain/portfolio.mjs: it re-reads the raw
// bytes out of the vault, recounts what the artefact should contain, and rehashes
// the artefact itself. A bug in the adapter therefore cannot approve its own
// output, and a hand-edited artefact file fails the hash check.
//
//   node scripts/verify-portfolio-artifact.mjs --db state/yeno.db \
//     --source-version SV-... --adapter for_ai --artifact-file path.json \
//     [--expect-sha256 <hash>] [--json]
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) args.set(a.slice(2), true);
  else {
    args.set(a.slice(2), next);
    i += 1;
  }
}

const VERIFIER = 'scripts/verify-portfolio-artifact.mjs';
const dbPath = args.get('db') ?? process.env.YENO_DB ?? 'state/yeno.db';
const sourceVersionId = args.get('source-version');
const adapterKind = args.get('adapter');
const artifactFile = args.get('artifact-file');
const expectSha = typeof args.get('expect-sha256') === 'string' ? args.get('expect-sha256') : null;
const asJson = args.get('json') === true;

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
    .join(',')}}`;
}

function finish(ok, problems, detail) {
  const report = { verifier: VERIFIER, ok, problems, detail };
  if (asJson) process.stdout.write(`${JSON.stringify(report)}\n`);
  else {
    for (const p of problems) process.stdout.write(`FAIL ${p}\n`);
    process.stdout.write(`${ok ? 'PORTFOLIO_ARTIFACT_VERIFIED' : 'PORTFOLIO_ARTIFACT_REJECTED'} ${detail}\n`);
  }
  process.exit(ok ? 0 : 1);
}

if (!sourceVersionId || !adapterKind || !artifactFile) {
  finish(false, ['usage: --db <db> --source-version <id> --adapter <kind> --artifact-file <path>'], 'bad invocation');
}
if (!existsSync(dbPath)) finish(false, [`no database at ${dbPath}`], 'no db');
if (!existsSync(artifactFile)) finish(false, [`no artefact at ${artifactFile}`], 'no artefact');

const db = new DatabaseSync(dbPath, { readOnly: true });
const row = db
  .prepare(
    `SELECT sv.blob_sha256, b.bytes FROM source_versions sv JOIN blobs b ON b.sha256 = sv.blob_sha256
      WHERE sv.source_version_id = ?`,
  )
  .get(sourceVersionId);
db.close();
if (!row) finish(false, [`source version ${sourceVersionId} has no stored bytes`], 'no source');

const bytes = Buffer.from(row.bytes);
const problems = [];
if (createHash('sha256').update(bytes).digest('hex') !== row.blob_sha256) {
  problems.push(`vault bytes for ${sourceVersionId} do not match their recorded hash`);
}
const text = bytes.toString('utf8');
// Recounted here, independently of the adapter's own notion of a content line.
const lines = text
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l !== '' && !l.startsWith('#'));

const raw = readFileSync(artifactFile, 'utf8');
let artifact;
try {
  artifact = JSON.parse(raw);
} catch (err) {
  finish(false, [`artefact is not JSON: ${err.message}`], 'unparseable');
}
const artifactHash = createHash('sha256').update(canonical(artifact)).digest('hex');
if (expectSha && artifactHash !== expectSha) {
  problems.push(`artefact hash ${artifactHash} does not match the recorded ${expectSha}`);
}
if (artifact.source_ref !== sourceVersionId) {
  problems.push(`artefact cites source ${artifact.source_ref}, not ${sourceVersionId}`);
}
if (artifact.adapter !== adapterKind) problems.push(`artefact claims adapter ${artifact.adapter}, not ${adapterKind}`);

if (adapterKind === 'for_ai') {
  // The parent repository's contract: claim-level, source-backed, and nothing
  // verified without a human. An adapter that marks its own output verified, or
  // that produces a claim with no source, is refused here.
  if (artifact.claim_count !== lines.length) {
    problems.push(`artefact claims ${artifact.claim_count} candidates, the raw source yields ${lines.length}`);
  }
  if (!Array.isArray(artifact.claims) || artifact.claims.length !== lines.length) {
    problems.push('the claim list does not match the recounted source lines');
  } else {
    for (const [i, claim] of artifact.claims.entries()) {
      if (claim.text !== lines[i]) problems.push(`candidate ${i + 1} text does not come from the source`);
      if (claim.source_ref !== sourceVersionId) problems.push(`candidate ${i + 1} cites no traceable source`);
      if (claim.status !== 'NEEDS_VERIFICATION') problems.push(`candidate ${i + 1} claims a verification the adapter cannot grant`);
    }
  }
  if (artifact.verified_claims !== 0) problems.push('an adapter pass may not report verified claims');
} else if (adapterKind === 'shopping_shorts') {
  const sections = Array.isArray(artifact.sections) ? artifact.sections : [];
  if (sections.length !== 3) problems.push(`expected 3 sections, found ${sections.length}`);
  for (const s of sections) {
    const line = lines[s.line_index];
    if (line === undefined) {
      if (s.state !== 'NEEDS_SOURCE' || s.text !== null) {
        problems.push(`${s.section}: invented text with no source line`);
      }
    } else if (s.state !== 'SOURCED' || s.text !== line) {
      problems.push(`${s.section}: text does not come from the source line it cites`);
    }
  }
  if (artifact.published !== false) problems.push('an adapter pass may not report a publication');
} else {
  problems.push(`no independent check is implemented for adapter ${adapterKind}`);
}

finish(
  problems.length === 0,
  problems,
  `${adapterKind} artefact ${artifactHash.slice(0, 16)} recomputed from ${lines.length} source lines`,
);
