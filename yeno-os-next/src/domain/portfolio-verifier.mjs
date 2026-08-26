// Glue between a portfolio pass and its independent verifier.
//
// This file spawns the verifier; it does not implement a single check. The
// checks live in scripts/verify-portfolio-artifact.mjs, which runs in its own
// process, reads the raw bytes back out of the vault and never imports the
// adapter. Keeping the glue and the judgement apart is the point: the adapter
// cannot influence the verdict, and a broken verifier fails the pass rather than
// silently approving it.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const VERIFIER_SCRIPT = new URL('../../scripts/verify-portfolio-artifact.mjs', import.meta.url).pathname;

/**
 * Returns a `verify` function for `runPortfolioCycle`. Every artefact is written
 * to disk first, so the thing that was judged is the thing that was kept.
 */
export function makeArtifactVerifier({ dbPath, artifactDir }) {
  return ({ artifactJson, artifactHash, sourceVersionId, adapterKind }) => {
    mkdirSync(artifactDir, { recursive: true });
    const file = join(artifactDir, `${adapterKind}-${artifactHash.slice(0, 16)}.json`);
    writeFileSync(file, `${artifactJson}\n`);
    const run = spawnSync(
      process.execPath,
      [
        VERIFIER_SCRIPT,
        '--db',
        dbPath,
        '--source-version',
        sourceVersionId,
        '--adapter',
        adapterKind,
        '--artifact-file',
        file,
        '--expect-sha256',
        artifactHash,
        '--json',
      ],
      { encoding: 'utf8' },
    );
    let parsed = null;
    try {
      parsed = JSON.parse((run.stdout ?? '').trim().split('\n').pop() ?? '');
    } catch {
      parsed = null;
    }
    const ok = run.status === 0 && parsed?.ok === true;
    return {
      ok,
      verifier: 'scripts/verify-portfolio-artifact.mjs',
      detail: ok
        ? `${parsed.detail}; artefact kept at ${file}`
        : `verifier exit ${run.status}: ${(parsed?.problems ?? [(run.stderr ?? '').trim() || 'no output']).join(' | ')}`,
      artifact_file: file,
    };
  };
}
