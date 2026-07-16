import { prisma } from "@/lib/prisma";
import { publishRealtimeEvent } from "@/lib/realtime/event-bus";
import type { NotificationType } from "@/generated/prisma/client";

export interface NotifyUserInput {
  userId: string;
  organizationId: string;
  type: NotificationType;
  title: string;
  message: string;
}

/**
 * Real outbound webhook dispatch — Slack and Microsoft Teams incoming
 * webhooks both accept a plain `{ text }` JSON payload, so one function
 * covers both. Fire-and-forget: a failed/misconfigured webhook must never
 * break the in-app notification it's mirroring.
 *
 * Exported (not just used internally) so platform-level alerting
 * (src/lib/monitoring/alerts.ts) can reuse the exact same dispatch logic for
 * its own, separate platform-level webhook URLs
 * (PLATFORM_ALERTS_SLACK_WEBHOOK_URL / PLATFORM_ALERTS_TEAMS_WEBHOOK_URL)
 * instead of duplicating this fetch/error-swallow logic.
 */
export async function dispatchWebhook(url: string | null | undefined, title: string, message: string): Promise<void> {
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `*${title}*\n${message}` }),
    });
  } catch (error) {
    console.error("[notifications] webhook dispatch failed:", error);
  }
}

/**
 * Creates a single Notification row for one user, and — if they've
 * configured one in Profile → Notifications — also posts it to their real
 * Slack/Teams webhook. Never throws — a failed notification must not break
 * the action that triggered it (mirrors logAudit / logActivity).
 */
export async function notifyUser(input: NotifyUserInput): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        organizationId: input.organizationId,
        type: input.type,
        title: input.title,
        message: input.message,
      },
    });

    publishRealtimeEvent({ kind: "notification", organizationId: input.organizationId });

    const preference = await prisma.userPreference.findUnique({
      where: { userId: input.userId },
      select: { slackWebhookUrl: true, teamsWebhookUrl: true },
    });
    await Promise.all([
      dispatchWebhook(preference?.slackWebhookUrl, input.title, input.message),
      dispatchWebhook(preference?.teamsWebhookUrl, input.title, input.message),
    ]);
  } catch (error) {
    console.error("[notifications] failed to notify user:", error);
  }
}

export interface NotifyOrganizationOwnersInput {
  organizationId: string;
  type: NotificationType;
  title: string;
  message: string;
}

/**
 * Notifies every OWNER/ADMIN of an organization — used for board-wide events
 * (meeting started/ended, decision made) so the whole leadership team is
 * informed, not just whichever single user happens to be looking. Looks up
 * ACTIVE memberships only. Never throws.
 */
export async function notifyOrganizationOwners(input: NotifyOrganizationOwnersInput): Promise<void> {
  try {
    const memberships = await prisma.membership.findMany({
      where: {
        organizationId: input.organizationId,
        status: "ACTIVE",
        role: { in: ["OWNER", "ADMIN"] },
      },
      select: { userId: true },
    });

    if (memberships.length === 0) return;

    await prisma.notification.createMany({
      data: memberships.map((m) => ({
        userId: m.userId,
        organizationId: input.organizationId,
        type: input.type,
        title: input.title,
        message: input.message,
      })),
    });

    publishRealtimeEvent({ kind: "notification", organizationId: input.organizationId });

    const preferences = await prisma.userPreference.findMany({
      where: { userId: { in: memberships.map((m) => m.userId) } },
      select: { slackWebhookUrl: true, teamsWebhookUrl: true },
    });
    await Promise.all(
      preferences.flatMap((p) => [
        dispatchWebhook(p.slackWebhookUrl, input.title, input.message),
        dispatchWebhook(p.teamsWebhookUrl, input.title, input.message),
      ]),
    );
  } catch (error) {
    console.error("[notifications] failed to notify organization owners:", error);
  }
}
