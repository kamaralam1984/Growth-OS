/**
 * Simple in-memory sliding-window rate limiter.
 *
 * IMPORTANT: this state lives in a module-level Map, so it is per-process.
 * In a multi-instance / serverless production deployment each instance would
 * have its own independent counters, which is NOT a correct global rate
 * limit. That's an intentional, documented limitation for this phase — a
 * real production deployment should replace this with a shared store (e.g.
 * Redis / Upstash) behind the same `checkRateLimit` signature.
 */

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  /** Max allowed hits within the window. */
  limit: number;
  /** Window size in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

/**
 * Records a hit for `key` and reports whether it is within the allowed
 * sliding window. Call once per attempt (e.g. per login/register/invite
 * request) — it both checks and records in a single call.
 */
export function checkRateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  maybeSweep();

  const now = Date.now();
  const windowStart = now - opts.windowMs;

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { hits: [] };
    buckets.set(key, bucket);
  }

  bucket.hits = bucket.hits.filter((timestamp) => timestamp > windowStart);

  if (bucket.hits.length >= opts.limit) {
    return { allowed: false, remaining: 0 };
  }

  bucket.hits.push(now);
  return { allowed: true, remaining: Math.max(0, opts.limit - bucket.hits.length) };
}

/**
 * Periodically drop empty/expired buckets so the Map doesn't grow forever
 * across the process lifetime. Cheap best-effort housekeeping, not required
 * for correctness.
 */
let lastSweep = Date.now();
function maybeSweep() {
  const now = Date.now();
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.hits.length === 0 || now - bucket.hits[bucket.hits.length - 1] > 10 * 60_000) {
      buckets.delete(key);
    }
  }
}
