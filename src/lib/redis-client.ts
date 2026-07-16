import IORedis, { Cluster, type ClusterNode, type RedisOptions } from "ioredis";

/**
 * Cluster-aware ioredis connection factory — the single place every real
 * ioredis connection in this codebase is constructed from:
 * src/lib/cache/redis-cache.ts, src/lib/security/rate-limit-distributed.ts,
 * src/lib/rag/embedding-queue.ts, src/lib/billing/recurring-billing-queue.ts,
 * src/lib/workflows/engine.ts, src/lib/workflows/webhook-delivery-queue.ts,
 * src/lib/scheduler/providers/bullmq-provider.ts, and
 * src/lib/monitoring/health.ts all call `createRedisClient` below instead of
 * `new IORedis(...)` directly, so a single env toggle
 * (`REDIS_CLUSTER_NODES`) switches every one of them from a single-instance
 * connection to a real ioredis Cluster client at once — nobody has to
 * remember to update N call sites individually the next time this changes.
 *
 * Default (REDIS_CLUSTER_NODES unset): behavior is completely unchanged —
 * this returns a plain `new IORedis(url, options)` single-instance client,
 * exactly what every one of those call sites constructed directly before
 * this file existed.
 *
 * Cluster mode (REDIS_CLUSTER_NODES set): a comma-separated list of real
 * "host:port" seed nodes, e.g.
 *   REDIS_CLUSTER_NODES=redis-cluster-1:6379,redis-cluster-2:6379,redis-cluster-3:6379
 * ioredis only needs a handful of real seed nodes — it discovers the full
 * slot topology itself (CLUSTER SLOTS against whichever seed it reaches
 * first), so listing all 6 nodes of docker-compose.cluster.yml's topology
 * is not required (the 3 masters are enough). See docker-compose.cluster.yml
 * at the repo root for a real, locally-runnable 6-node cluster (3 masters +
 * 3 replicas) to test this against with `docker compose -f
 * docker-compose.yml -f docker-compose.cluster.yml up`.
 *
 * `options` (BullMQ's `maxRetriesPerRequest: null`, the health check's
 * `connectTimeout`/`lazyConnect`, etc.) are forwarded as-is in
 * single-instance mode, and via Cluster's own `redisOptions` in cluster
 * mode — ioredis.Cluster's documented mechanism for applying per-node
 * connection options (top-level `ClusterOptions` configure cluster-level
 * behavior; per-connection options like `maxRetriesPerRequest` must go
 * under `redisOptions` for a Cluster client).
 */
export type RedisLikeClient = IORedis | Cluster;

function parseClusterNodes(raw: string): ClusterNode[] {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const [host, portStr] = entry.split(":");
      return { host, port: portStr ? Number(portStr) : 6379 };
    });
}

/**
 * @param url - the single-instance connection string (e.g. REDIS_URL or a
 *   caller-specific fallback). Ignored in cluster mode — cluster seed nodes
 *   come from REDIS_CLUSTER_NODES instead, since a cluster has no single
 *   connection URL.
 * @param options - per-site IORedis options, applied directly in
 *   single-instance mode and forwarded as Cluster `redisOptions` in cluster
 *   mode (see file header).
 */
export function createRedisClient(url: string, options: RedisOptions = {}): RedisLikeClient {
  const clusterNodesRaw = process.env.REDIS_CLUSTER_NODES;
  if (clusterNodesRaw && clusterNodesRaw.trim().length > 0) {
    return new Cluster(parseClusterNodes(clusterNodesRaw), { redisOptions: options });
  }
  return new IORedis(url, options);
}
