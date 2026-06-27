import { createHash } from 'crypto';

/**
 * Shared fallback salt used only when CONTRIBUTOR_SALT is not configured.
 * A known constant salt weakens anonymization, so production must set the
 * CONTRIBUTOR_SALT secret. The fallback exists so local/dev runs work and so
 * every route stays consistent (a divergent fallback would record the same
 * contributor under different hashes across endpoints).
 */
const FALLBACK_CONTRIBUTOR_SALT = 'forai-default-salt';

let warnedMissingSalt = false;

/**
 * Resolves the contributor salt from the environment, falling back to a single
 * shared constant. Warns once (in production) when the secret is missing so the
 * weakened-anonymization state is visible in logs without breaking submissions.
 */
export function resolveContributorSalt(): string {
  const salt = process.env.CONTRIBUTOR_SALT;
  if (salt && salt.length > 0) return salt;
  if (process.env.NODE_ENV === 'production' && !warnedMissingSalt) {
    warnedMissingSalt = true;
    console.warn(
      '[contributor-hash] CONTRIBUTOR_SALT is not set in production; using shared fallback salt. ' +
        'Set the CONTRIBUTOR_SALT secret to restore anonymization strength.'
    );
  }
  return FALLBACK_CONTRIBUTOR_SALT;
}

/**
 * Generates an anonymized 16-char hex hash of the contributor's IP.
 * Raw IPs are NEVER stored. (AGENTS.md rule: use contributor_hash only)
 *
 * The salt is resolved from process.env.CONTRIBUTOR_SALT via
 * resolveContributorSalt() unless an explicit salt is provided. Resolving in
 * one place keeps every route consistent.
 *
 * @param ip   - Extracted from x-forwarded-for or similar header
 * @param salt - Optional explicit salt; defaults to resolveContributorSalt()
 */
export function makeContributorHash(ip: string, salt: string = resolveContributorSalt()): string {
  return createHash('sha256')
    .update(ip + salt)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Extracts the client IP from a Next.js Request object.
 * Falls back to 'unknown' if no header is present.
 */
export function extractIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}
