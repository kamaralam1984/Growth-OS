import { createRedisClient, type RedisLikeClient } from "@/lib/redis-client";

/**
 * Generic Redis caching layer. A dedicated connection from BullMQ's
 * (src/lib/scheduler/providers/bullmq-provider.ts) — different subsystems
 * get their own connections even though both read REDIS_URL — cached via a
 * globalThis guard against Next dev hot-reload duplication.
 *
 * Cache unavailability must never break the app: every exported function
 * swallows Redis errors and degrades to "no cache" behavior instead of
 * throwing.
 *
 * Connections are built via createRedisClient (src/lib/redis-client.ts) so
 * this cache transparently becomes cluster-aware whenever
 * REDIS_CLUSTER_NODES is set, with zero change to the code below.
 */

function getRedisUrl(): string {
  return process.env.REDIS_URL ?? "redis://localhost:6379";
}

const globalForCache = globalThis as unknown as {
  __redisCacheConnection?: RedisLikeClient;
};

function getConnection(): RedisLikeClient {
  if (!globalForCache.__redisCacheConnection) {
    globalForCache.__redisCacheConnection = createRedisClient(getRedisUrl(), { maxRetriesPerRequest: null });
    globalForCache.__redisCacheConnection.on("error", (err) => {
      console.error("[cache:redis] connection error:", err);
    });
  }
  return globalForCache.__redisCacheConnection;
}

export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const raw = await getConnection().get(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch (error) {
    console.error(`[cache:redis] getCached("${key}") failed:`, error);
    return null;
  }
}

export async function setCached<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  try {
    await getConnection().set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (error) {
    console.error(`[cache:redis] setCached("${key}") failed:`, error);
  }
}

export async function invalidateCache(key: string): Promise<void> {
  try {
    await getConnection().del(key);
  } catch (error) {
    console.error(`[cache:redis] invalidateCache("${key}") failed:`, error);
  }
}

/** Ergonomic read-through cache — the function most call sites should actually use. */
export async function withCache<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
  const cached = await getCached<T>(key);
  if (cached !== null) return cached;
  const value = await compute();
  await setCached(key, value, ttlSeconds);
  return value;
}
