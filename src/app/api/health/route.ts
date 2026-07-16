import { NextResponse } from "next/server";

import { runAndRecordFullSystemCheck } from "@/lib/monitoring/aggregate";
import { logger } from "@/lib/monitoring/logger";
import type { ComponentHealth } from "@/lib/monitoring/health";

/**
 * Public, unauthenticated infrastructure health check — a real load
 * balancer/uptime monitor (or a human curling this URL) must be able to
 * reach it with no session/API key, per the standard health-check
 * convention this route follows: HTTP 200 when overall status is
 * HEALTHY/DEGRADED, HTTP 503 when DOWN, so any orchestrator polling this
 * endpoint can make a real routing/restart decision off the status code
 * alone without parsing the body.
 *
 * Every call here is a REAL, live probe (runAndRecordFullSystemCheck calls
 * health.ts's runFullHealthCheck + all 4 real BullMQ queue checks) — never a
 * cached/fabricated "all green." It also persists this run's results as
 * SystemHealthSnapshot rows and reconciles SystemAlert rows as a side
 * effect, so uptime history/alerting accrues from real traffic to this
 * endpoint even without the periodic "health-snapshot" scheduled job.
 *
 * Because this route has NO auth gate, the JSON body intentionally never
 * echoes a component's raw `detail` string (which can contain a raw
 * database/Redis connection error, hostnames, etc.) — that real detail is
 * still logged server-side (via logger.error) and stored in full on the
 * SystemHealthSnapshot row for the authenticated Production Dashboard to
 * read; the public response only ever exposes component/status/latency.
 */

export const dynamic = "force-dynamic";

interface PublicComponentHealth {
  component: ComponentHealth["component"];
  status: ComponentHealth["status"];
  latencyMs?: number;
}

function toPublicComponent(component: ComponentHealth): PublicComponentHealth {
  return { component: component.component, status: component.status, latencyMs: component.latencyMs };
}

export async function GET(): Promise<NextResponse> {
  try {
    const result = await runAndRecordFullSystemCheck();

    for (const component of result.components) {
      if (component.status === "DOWN") {
        logger.error("health-check: component reported DOWN", {
          component: component.component,
          detail: component.detail ?? null,
        });
      }
    }

    const body = {
      overall: result.overall,
      checkedAt: result.checkedAt,
      components: result.components.map(toPublicComponent),
    };

    return NextResponse.json(body, { status: result.overall === "DOWN" ? 503 : 200 });
  } catch (error) {
    // The health check pipeline itself failed (not just one component) —
    // still a real, honest DOWN response, with the real error logged
    // server-side only.
    logger.error("health-check: runAndRecordFullSystemCheck threw", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { overall: "DOWN", checkedAt: new Date().toISOString(), components: [] },
      { status: 503 },
    );
  }
}
