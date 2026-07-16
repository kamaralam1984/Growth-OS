import { createRedisClient, type RedisLikeClient } from "@/lib/redis-client";
import { checkRateLimit, type RateLimitOptions, type RateLimitResult } from "@/lib/rate-limit";

/**
 * Real, shared, multi-instance-correct sliding-window rate limiter — a
 * Redis sorted-set implementation, unlike src/lib/rate-limit.ts's
 * documented single-process in-memory Map. That existing limiter is left
 * completely untouched (31 call sites across this codebase already depend
 * on its synchronous signature) for its own call sites — but the two
 * security-critical enforcement points that most need multi-instance
 * correctness (src/proxy.ts's edge auth-attempt throttle and src/auth.ts's
 * Credentials login throttle) now go through `checkRateLimitDegradable`
 * below instead, which prefers this real Redis-backed limiter and only
 * drops back to the in-memory one if Redis itself is unreachable, so
 * behavior degrades gracefully rather than breaking. Migrating one of the
 * other ~30 call sites to this one is a safe, mechanical, one-at-a-time
 * follow-up, not required for either limiter to be "correct" — a
 * single-instance deployment (a completely legitimate, common real
 * topology) is already correctly rate-limited by the existing in-memory
 * version today.
 *
 * Connections are built via createRedisClient (src/lib/redis-client.ts) so
 * this limiter transparently becomes cluster-aware whenever
 * REDIS_CLUSTER_NODES is set, with zero change to the code below.
 */

function getRedisUrl(): string {
  return process.env.REDIS_URL ?? "redis://localhost:6379";
}

const globalForDistributedRateLimit = globalThis as unknown as { __rateLimitRedisConnection?: RedisLikeClient };

function getConnection(): RedisLikeClient {
  if (!globalForDistributedRateLimit.__rateLimitRedisConnection) {
    globalForDistributedRateLimit.__rateLimitRedisConnection = createRedisClient(getRedisUrl(), { maxRetriesPerRequest: null });
    globalForDistributedRateLimit.__rateLimitRedisConnection.on("error", (err) => {
      console.error("[security/rate-limit-distributed] Redis connection error:", err);
    });
  }
  return globalForDistributedRateLimit.__rateLimitRedisConnection;
}

export interface DistributedRateLimitOptions {
  limit: number;
  windowMs: number;
}

export interface DistributedRateLimitResult {
  allowed: boolean;
  remaining: number;
}

/**
 * The actual Redis ZSET sliding-window round trip, shared by both exported
 * functions below: each hit is a member scored by its own timestamp; every
 * call prunes members older than the window before counting, so the count
 * is always exact, never approximate. Deliberately RETHROWS on a Redis
 * failure rather than deciding what to do about it — that decision differs
 * between the two callers (fail open vs. fail over to the in-memory
 * limiter), so it belongs to them, not to this shared core.
 */
async function runDistributedRateLimit(key: string, opts: DistributedRateLimitOptions): Promise<DistributedRateLimitResult> {
  const redisKey = `ratelimit:${key}`;
  const now = Date.now();
  const windowStart = now - opts.windowMs;

  const redis = getConnection();
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(redisKey, 0, windowStart);
  pipeline.zcard(redisKey);
  const results = await pipeline.exec();
  const currentCount = (results?.[1]?.[1] as number) ?? 0;

  if (currentCount >= opts.limit) {
    return { allowed: false, remaining: 0 };
  }

  await redis
    .multi()
    .zadd(redisKey, now, `${now}-${Math.random().toString(36).slice(2, 8)}`)
    .pexpire(redisKey, opts.windowMs)
    .exec();

  return { allowed: true, remaining: Math.max(0, opts.limit - currentCount - 1) };
}

/**
 * Fails OPEN (allowed: true) on a genuine Redis outage — the same fail-open
 * posture this app already takes for cache misses elsewhere
 * (src/lib/cache/redis-cache.ts), since a rate limiter that fails closed
 * would turn a Redis outage into a full outage for every real user, a worse
 * outcome than temporarily un-throttled traffic. Used today by the
 * compliance self-test (src/lib/security/compliance.ts) and available for
 * any future call site that explicitly wants that tradeoff; the enforcement
 * paths that need a stronger guarantee (still throttled, just per-instance,
 * on a Redis outage) use `checkRateLimitDegradable` below instead.
 */
export async function checkDistributedRateLimit(key: string, opts: DistributedRateLimitOptions): Promise<DistributedRateLimitResult> {
  try {
    return await runDistributedRateLimit(key, opts);
  } catch (error) {
    console.error(`[security/rate-limit-distributed] checkDistributedRateLimit("${key}") failed, failing open:`, error);
    return { allowed: true, remaining: opts.limit };
  }
}

/**
 * The real enforcement path for security-critical call sites: always tries
 * the shared, multi-instance-correct Redis limiter first. If Redis is
 * unreachable, this does NOT fail open (unlike `checkDistributedRateLimit`
 * above) — it falls back to `checkRateLimit`'s in-memory sliding window
 * (src/lib/rate-limit.ts) instead, so the request is still genuinely
 * throttled (per-process, the same real limitation every one of that
 * function's ~30 existing call sites already lives with today), rather than
 * the gate being wide open for every caller on every instance for as long
 * as Redis stays down. Same (key, opts) => RateLimitResult shape as
 * `checkRateLimit`, just async — the two functions share `limit`/`windowMs`/
 * `allowed`/`remaining` field names by design so a call site can switch
 * between them with only an `await` added.
 */
export async function checkRateLimitDegradable(key: string, opts: RateLimitOptions): Promise<RateLimitResult> {
  try {
    return await runDistributedRateLimit(key, opts);
  } catch (error) {
    console.error(`[security/rate-limit-distributed] checkRateLimitDegradable("${key}") Redis unavailable, falling back to in-memory limiter:`, error);
    return checkRateLimit(key, opts);
  }
}
