import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

export const ZERO_HASH = '0'.repeat(64);

export function sha256(input) {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Deterministic JSON serialization: object keys sorted, no insertion-order
 * dependence, so the same logical payload always hashes to the same value.
 */
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
}

export function sha256Json(value) {
  return sha256(canonicalJson(value));
}

export async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
