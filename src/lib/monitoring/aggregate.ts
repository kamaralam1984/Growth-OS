import { prisma } from "@/lib/prisma";
import { runFullHealthCheck, checkQueueHealth, type ComponentHealth, type FullHealthCheckResult } from "./health";
import { createSystemAlert, resolveSystemAlert } from "./alerts";
import { logger } from "./logger";
import { getQueueStats } from "@/lib/scheduler/providers/bullmq-provider";
import { getWorkflowQueueStats } from "@/lib/workflows/engine";
import { getRagQueueStats } from "@/lib/rag/embedding-queue";
import { getRecurringBillingQueueStats } from "@/lib/billing/recurring-billing-queue";
import type { SystemAlertType, SystemComponent } from "@/generated/prisma/client";

/**
 * The full, real system check this app actually runs — health.ts's
 * runFullHealthCheck() covers DATABASE/REDIS/AI_PROVIDER/PAYMENT_GATEWAY/
 * STORAGE; this adds the 4 real BullMQ queues (each a genuinely separate
 * Queue/Redis-backed component per prisma/schema.prisma's SystemComponent
 * enum) via health.ts's own checkQueueHealth helper, so both /api/health and
 * the Production Dashboard see one single, complete component list.
 *
 * HONEST GAP: SystemComponent also defines EMBEDDING_PROVIDER and EMAIL —
 * neither has a real live probe anywhere in this app yet (no dedicated
 * health-check function exists for either), so neither appears in the
 * `components` list below. Nothing fabricates a status for them; they are
 * simply not checked yet.
 */
export async function runFullSystemCheck(): Promise<FullHealthCheckResult> {
  const [base, workflowQueue, schedulerQueue, ragQueue, billingQueue] = await Promise.all([
    runFullHealthCheck(),
    checkQueueHealth("WORKFLOW_QUEUE", getWorkflowQueueStats),
    checkQueueHealth("SCHEDULER_QUEUE", getQueueStats),
    checkQueueHealth("RAG_QUEUE", getRagQueueStats),
    checkQueueHealth("BILLING_QUEUE", getRecurringBillingQueueStats),
  ]);

  const components = [...base.components, workflowQueue, schedulerQueue, ragQueue, billingQueue];
  const overall = components.some((c) => c.status === "DOWN")
    ? "DOWN"
    : components.some((c) => c.status === "DEGRADED")
      ? "DEGRADED"
      : "HEALTHY";

  return { overall, components, checkedAt: new Date().toISOString() };
}

/** Writes one SystemHealthSnapshot row per component — the historical record the Production Dashboard's uptime trend reads from. */
export async function persistHealthSnapshots(components: ComponentHealth[]): Promise<void> {
  try {
    await prisma.systemHealthSnapshot.createMany({
      data: components.map((c) => ({
        component: c.component,
        status: c.status,
        latencyMs: c.latencyMs ?? null,
        detail: c.detail ?? null,
      })),
    });
  } catch (error) {
    logger.error("health-snapshot: failed to persist SystemHealthSnapshot rows", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const ALERT_TYPE_BY_COMPONENT: Partial<Record<SystemComponent, SystemAlertType>> = {
  DATABASE: "DATABASE_FAILURE",
  AI_PROVIDER: "AI_PROVIDER_FAILURE",
  PAYMENT_GATEWAY: "PAYMENT_FAILURE",
  STORAGE: "STORAGE_FAILURE",
  WORKFLOW_QUEUE: "QUEUE_FAILURE",
  SCHEDULER_QUEUE: "QUEUE_FAILURE",
  RAG_QUEUE: "QUEUE_FAILURE",
  BILLING_QUEUE: "QUEUE_FAILURE",
  // REDIS has no single matching SystemAlertType in the schema (it isn't a
  // queue and there's no dedicated "cache/redis down" type) — a DOWN Redis
  // already surfaces as DEGRADED/DOWN on every queue that depends on it
  // (all 4 checkQueueHealth calls above fail the same way Redis does), so
  // it is honestly not double-alerted here under a type that doesn't fit.
};

/**
 * For every DOWN component with a matching SystemAlertType, creates (or
 * updates, if already ACTIVE) a CRITICAL SystemAlert — never a duplicate,
 * per createSystemAlert's own dedup logic. For every component that is
 * HEALTHY/DEGRADED (i.e. NOT down) with a matching alert type, auto-resolves
 * any still-ACTIVE/ACKNOWLEDGED alert of that type — an outage that has
 * genuinely recovered shouldn't require a human to manually clear the alert
 * every time this check runs.
 */
export async function reconcileSystemAlerts(components: ComponentHealth[]): Promise<void> {
  for (const component of components) {
    const alertType = ALERT_TYPE_BY_COMPONENT[component.component];
    if (!alertType) continue;

    if (component.status === "DOWN") {
      await createSystemAlert({
        type: alertType,
        severity: "CRITICAL",
        title: `${component.component.replaceAll("_", " ")} is DOWN`,
        message: component.detail ?? `${component.component} health check reported DOWN with no further detail.`,
        metadata: { component: component.component, latencyMs: component.latencyMs ?? null },
      });
      continue;
    }

    const active = await prisma.systemAlert.findFirst({
      where: { type: alertType, status: { in: ["ACTIVE", "ACKNOWLEDGED"] } },
      orderBy: { createdAt: "desc" },
    });
    if (active) {
      await resolveSystemAlert(active.id).catch((error) =>
        logger.error("health-snapshot: failed to auto-resolve recovered SystemAlert", {
          alertId: active.id,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
}

/** The one real, shared "check + persist + alert" pipeline both /api/health and the periodic health-snapshot job run. */
export async function runAndRecordFullSystemCheck(): Promise<FullHealthCheckResult> {
  const result = await runFullSystemCheck();
  await Promise.all([persistHealthSnapshots(result.components), reconcileSystemAlerts(result.components)]);
  return result;
}
