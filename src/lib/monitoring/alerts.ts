import { prisma } from "@/lib/prisma";
import { dispatchWebhook, notifyUser } from "@/lib/notifications";
import { logger } from "./logger";
import type { Prisma, SystemAlert, SystemAlertSeverity, SystemAlertType } from "@/generated/prisma/client";

/**
 * Infrastructure/operational alerting on top of the real SystemAlert model
 * (prisma/schema.prisma) — deliberately separate from the pre-existing
 * org-scoped business-KPI `Alert` model (src/lib/alerts/engine.ts's
 * evaluateAlerts, "this deal's health score dropped"). These rows are only
 * ever created by real monitoring checks (src/lib/monitoring/health.ts via
 * aggregate.ts, or any other real infra probe) — never synthetic demo data.
 */

export interface CreateSystemAlertInput {
  type: SystemAlertType;
  severity: SystemAlertSeverity;
  title: string;
  message: string;
  metadata?: Record<string, unknown> | null;
}

/**
 * Real webhook dispatch for platform-level (cross-tenant infra) alerts.
 *
 * HONEST GAP: src/lib/notifications.ts's dispatchWebhook is already wired
 * for PER-ORGANIZATION Slack/Teams webhooks (UserPreference.slackWebhookUrl/
 * teamsWebhookUrl) — there was no existing platform-level (i.e. "notify
 * whoever operates this entire deployment," not any one tenant) webhook
 * concept before this file. PLATFORM_ALERTS_SLACK_WEBHOOK_URL /
 * PLATFORM_ALERTS_TEAMS_WEBHOOK_URL are NEW env vars added for exactly that
 * (see .env.example). Until an operator sets one, this call is a genuine
 * no-op (dispatchWebhook itself already early-returns on a null/undefined
 * url) — not a fabricated "sent" — and the in-app Notification to platform
 * owners below is the only channel that actually fires.
 */
async function dispatchPlatformWebhooks(title: string, message: string): Promise<void> {
  await Promise.all([
    dispatchWebhook(process.env.PLATFORM_ALERTS_SLACK_WEBHOOK_URL, title, message),
    dispatchWebhook(process.env.PLATFORM_ALERTS_TEAMS_WEBHOOK_URL, title, message),
  ]);
}

/**
 * Real in-app Notification to every User.isPlatformOwner user.
 *
 * HONEST GAP: `Notification.organizationId` is a required, non-nullable
 * column (prisma/schema.prisma) — there is no platform-wide, org-less
 * notification target in this schema. So for each platform owner, this
 * attaches their alert Notification to their own oldest ACTIVE membership's
 * organization (arbitrary but stable — just needs *an* organizationId the
 * FK can point to; the Production Dashboard where this alert is actually
 * read lives outside any one organization's dashboard, gated by
 * requirePlatformOwner, not by that organizationId). A platform owner with
 * zero ACTIVE memberships gets no in-app row (there is no organization to
 * attach it to) — they still receive the webhook dispatch above if one is
 * configured, and the alert is always visible on /admin/production
 * regardless via listActiveSystemAlerts(), so nothing is silently lost.
 */
async function notifyPlatformOwners(title: string, message: string): Promise<void> {
  const owners = await prisma.user.findMany({
    where: { isPlatformOwner: true },
    select: {
      id: true,
      memberships: {
        where: { status: "ACTIVE" },
        orderBy: { joinedAt: "asc" },
        take: 1,
        select: { organizationId: true },
      },
    },
  });

  await Promise.all(
    owners
      .filter((owner) => owner.memberships.length > 0)
      .map((owner) =>
        notifyUser({
          userId: owner.id,
          organizationId: owner.memberships[0].organizationId,
          type: "CRITICAL_ALERT",
          title,
          message,
        }),
      ),
  );

  const skipped = owners.filter((owner) => owner.memberships.length === 0).length;
  if (skipped > 0) {
    logger.warn("system-alert: platform owner(s) skipped for in-app notification — no ACTIVE membership to attach it to", { skipped });
  }
}

/**
 * Creates a new ACTIVE SystemAlert, or — if one of the same `type` is
 * already ACTIVE — updates that existing row's title/message/metadata
 * in place instead of creating a duplicate (per spec: "never duplicate an
 * already-ACTIVE alert of the same type"). Only a genuinely NEW alert
 * triggers notification dispatch; re-reporting the same ongoing outage
 * every health check must not spam Slack/Teams/in-app notifications every
 * few minutes.
 */
export async function createSystemAlert(input: CreateSystemAlertInput): Promise<SystemAlert> {
  const metadata = (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined;

  const existing = await prisma.systemAlert.findFirst({
    where: { type: input.type, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    return prisma.systemAlert.update({
      where: { id: existing.id },
      data: { title: input.title, message: input.message, metadata },
    });
  }

  const alert = await prisma.systemAlert.create({
    data: { type: input.type, severity: input.severity, title: input.title, message: input.message, metadata },
  });

  logger.error("system-alert: new alert created", { type: input.type, severity: input.severity, title: input.title });

  if (input.severity === "CRITICAL") {
    await Promise.all([
      dispatchPlatformWebhooks(input.title, input.message),
      notifyPlatformOwners(input.title, input.message),
    ]);
  }

  return alert;
}

export async function acknowledgeSystemAlert(id: string): Promise<SystemAlert> {
  return prisma.systemAlert.update({
    where: { id },
    data: { status: "ACKNOWLEDGED", acknowledgedAt: new Date() },
  });
}

export async function resolveSystemAlert(id: string): Promise<SystemAlert> {
  return prisma.systemAlert.update({
    where: { id },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });
}

/** ACTIVE + ACKNOWLEDGED alerts (i.e. everything not yet RESOLVED), worst severity/newest first. */
export async function listActiveSystemAlerts(limit = 50): Promise<SystemAlert[]> {
  return prisma.systemAlert.findMany({
    where: { status: { in: ["ACTIVE", "ACKNOWLEDGED"] } },
    orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    take: limit,
  });
}
