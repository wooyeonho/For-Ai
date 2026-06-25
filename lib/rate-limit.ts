// Lightweight in-memory fixed-window rate limiter for public endpoints.
//
// Note: this is per-instance (each serverless/edge worker keeps its own map), so
// it is a best-effort guard against casual counter-gaming and accidental loops,
// not a distributed quota. For hard limits across regions, back this with Redis/
// Upstash. Sufficient for protecting view/cite counter integrity.

type Bucket = { count: number; resetAt: number };

const stores = new Map<string, Map<string, Bucket>>();

export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Returns true when the caller has EXCEEDED the limit for this window.
 * @param namespace logical bucket group (e.g. "doc-view")
 * @param key per-caller key (e.g. ip + slug)
 * @param max max requests allowed per window
 * @param windowMs window length in ms
 */
export function rateLimited(
  namespace: string,
  key: string,
  max: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  let store = stores.get(namespace);
  if (!store) {
    store = new Map();
    stores.set(namespace, store);
  }
  const bucket = store.get(key);
  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  bucket.count += 1;
  return bucket.count > max;
}
