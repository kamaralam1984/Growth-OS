import { prisma } from "@/lib/prisma";

/**
 * No app-store backend exists, so this is a real, DB-backed catalog rather
 * than a live marketplace API — seeded once, lazily, the first time the page
 * loads (mirrors ensureTodaySnapshot's pattern; no seed script to remember
 * to run). Slack/Teams are marked AVAILABLE because they're genuinely wired
 * — see src/lib/notifications.ts's dispatchWebhook, fed by the existing
 * Profile → Notifications webhook fields. Everything else is honestly
 * COMING_SOON — no fake "installed" state for integrations that don't exist.
 */
const CATALOG: Array<{
  name: string;
  description: string;
  category: "INTEGRATION" | "TEMPLATE" | "AGENT_PACK";
  status: "AVAILABLE" | "COMING_SOON";
  icon: string;
}> = [
  {
    name: "Slack Notifications",
    description: "Mirror every in-app notification to a Slack channel via an incoming webhook. Configure your webhook URL in Profile → Notifications.",
    category: "INTEGRATION",
    status: "AVAILABLE",
    icon: "slack",
  },
  {
    name: "Microsoft Teams Notifications",
    description: "Mirror every in-app notification to a Teams channel via an incoming webhook. Configure your webhook URL in Profile → Notifications.",
    category: "INTEGRATION",
    status: "AVAILABLE",
    icon: "teams",
  },
  {
    name: "Google Calendar Sync",
    description: "Two-way sync between AI Executive Board meetings and your Google Calendar.",
    category: "INTEGRATION",
    status: "COMING_SOON",
    icon: "calendar",
  },
  {
    name: "Stripe Billing",
    description: "Real payment processing for the Billing page — plans, invoices, and card management.",
    category: "INTEGRATION",
    status: "COMING_SOON",
    icon: "credit-card",
  },
  {
    name: "Zapier",
    description: "Trigger zaps from GrowthOS events (new lead, task completed, proposal ready) and vice versa.",
    category: "INTEGRATION",
    status: "COMING_SOON",
    icon: "zap",
  },
  {
    name: "Gmail / Outlook Sync",
    description: "Send proposals and outreach drafts directly from your connected inbox, with reply tracking.",
    category: "INTEGRATION",
    status: "COMING_SOON",
    icon: "mail",
  },
  {
    name: "Dashboard Templates Pack",
    description: "Extra pre-built widget layouts for Support, Finance, and Ops teams.",
    category: "TEMPLATE",
    status: "COMING_SOON",
    icon: "layout-template",
  },
  {
    name: "Legal Agent Pack",
    description: "An additional AI executive agent specialized in contract review and compliance.",
    category: "AGENT_PACK",
    status: "COMING_SOON",
    icon: "scale",
  },
];

export async function ensureMarketplaceCatalog(): Promise<void> {
  const count = await prisma.marketplaceListing.count();
  if (count > 0) return;

  await prisma.marketplaceListing
    .createMany({ data: CATALOG })
    .catch((error) => {
      console.error("[marketplace] failed to seed catalog:", error);
    });
}
