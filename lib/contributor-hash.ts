import { createHash } from 'crypto';

/**
 * Generates an anonymized 16-char hex hash of the contributor's IP.
 * Raw IPs are NEVER stored. (AGENTS.md rule: use contributor_hash only)
 *
 * @param ip   - Extracted from x-forwarded-for or similar header
 * @param salt - process.env.CONTRIBUTOR_SALT (Vercel secret, required for public submissions)
 */
export function getContributorSalt(): string {
  const salt = process.env.CONTRIBUTOR_SALT?.trim();
  if (!salt) {
    throw new Error('CONTRIBUTOR_SALT is required to generate contributor_hash');
  }
  return salt;
}

export function makeContributorHash(ip: string, salt: string): string {
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

export function makeContributorHashForRequest(request: Request): string {
  return makeContributorHash(extractIp(request), getContributorSalt());
}
