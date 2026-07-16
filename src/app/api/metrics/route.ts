import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { getMetricsRegistry } from "@/lib/monitoring/metrics";
import { logger } from "@/lib/monitoring/logger";

/**
 * Prometheus scrape endpoint — real, freshly-collected system/queue/API
 * metrics (see src/lib/monitoring/metrics.ts), never cached/fabricated.
 *
 * Unlike /api/health (deliberately public, per that route's own comment),
 * this is gated behind METRICS_TOKEN: a shared secret an operator sets in
 * .env.example, sent back as either the `x-metrics-token` header or a
 * `?token=` query param (Prometheus's own `bearer_token`/`params` scrape
 * config supports either). With METRICS_TOKEN unset, this endpoint is
 * honestly reported as not configured (503) rather than either silently
 * wide open or fabricating a rejection — same "not configured until a real
 * value is set" convention this app already uses for every other optional
 * integration (see .env.example).
 */

export const dynamic = "force-dynamic";

function isAuthorized(request: Request, token: string): boolean {
  const url = new URL(request.url);
  const provided = request.headers.get("x-metrics-token") ?? url.searchParams.get("token");
  if (!provided) return false;

  const expected = Buffer.from(token);
  const actual = Buffer.from(provided);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function GET(request: Request): Promise<NextResponse> {
  const token = env.METRICS_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "Metrics endpoint not configured — set METRICS_TOKEN to enable it (see .env.example)." },
      { status: 503 },
    );
  }

  if (!isAuthorized(request, token)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const registry = getMetricsRegistry();
    const body = await registry.metrics();
    return new NextResponse(body, { status: 200, headers: { "Content-Type": registry.contentType } });
  } catch (error) {
    logger.error("metrics: failed to collect Prometheus metrics", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to collect metrics." }, { status: 500 });
  }
}
