/**
 * Single source of truth for the Enterprise Admin Platform page
 * (src/components/sections/admin-platform/*.tsx, src/app/admin-platform/page.tsx).
 *
 * Every claim was independently verified against this codebase (2 research
 * passes, 2026-07-29) before being written. Confirmed REAL: a rich,
 * filterable, hash-chained platform-wide Audit Log; a real Production/
 * System Health dashboard (live probes + history); real Incident tracking;
 * a real Compliance Center; real cross-tenant Billing Administration
 * (MRR/ARR/churn/revenue trend/top customers/failed payments/outstanding
 * invoices) — though read-only monitoring, not a full billing-ops console
 * (no plan/coupon/refund management for subscriptions); real Payout
 * tracking (disbursement itself is manual); a real Marketplace admin
 * suite (listings/publishers/reviews/orders, including real refunds for
 * marketplace purchases specifically).
 *
 * Confirmed FALSE/missing — the admin sidebar's own code comment
 * (src/app/admin/_components/admin-sidebar.tsx) explicitly documents this
 * as deliberately out of scope so far: a platform-wide Organization
 * directory, a platform-wide User directory, a platform-wide Session
 * Manager (only per-user self-service session management exists), a
 * visual Permissions Matrix (authorization is real but code-level, no
 * management UI), a dedicated browsable Security Events list (events are
 * real but only surfaced inside the Production dashboard / as auto-opened
 * Incidents), an admin Notification Center, a dedicated executive
 * Platform Analytics page (the numbers exist, just inside the Billing
 * page), a platform-level Developer & Integration management console, a
 * global Platform Settings UI (config is env-var-only today), and any
 * automated Platform Insights/AI recommendations feature.
 */

export interface AdminCapability {
  title: string;
  description: string;
  detail: string;
}

export interface ComingSoonResource {
  title: string;
  description: string;
}

// ---------- Real, live admin capabilities ----------

export const REAL_ADMIN_CAPABILITIES: AdminCapability[] = [
  {
    title: "Audit Log",
    description: "A real, filterable, tamper-evident record of platform activity.",
    detail: "Filter by action, organization, user, or date range. Every entry is part of a hash-chained trail — the same real audit system covered in our Trust Center's Access Control section.",
  },
  {
    title: "System Health Dashboard",
    description: "Live infrastructure health, not a static status claim.",
    detail: "Database, cache, storage, and background-job queues are checked live, with real historical uptime tracked over time — the same data shown publicly on our status page.",
  },
  {
    title: "Incident Management",
    description: "Real incidents, tracked from detection to resolution.",
    detail: "Critical security events automatically open a tracked incident. Operators can also declare one manually — nothing here is simulated.",
  },
  {
    title: "Compliance Center",
    description: "Code-verified compliance-readiness tracking across real frameworks.",
    detail: "An honest architectural-readiness snapshot — never presented as a certification. See our Trust Center for the full breakdown.",
  },
  {
    title: "Revenue & Billing Monitoring",
    description: "Real MRR, ARR, churn, and growth metrics, computed live.",
    detail: "Includes failed-payment and overdue-invoice tracking and top customers by revenue. This is a monitoring dashboard today — plan and coupon management happen at the account level, not from this console yet.",
  },
  {
    title: "Payout Tracking",
    description: "A real, auditable ledger of partner commissions and payouts.",
    detail: "Marking a payout as paid is a manual confirmation step tied to an actual bank/PayPal transfer completed outside the platform — we don't claim an automated disbursement API that doesn't exist.",
  },
  {
    title: "Marketplace Administration",
    description: "Full moderation and order management for the app marketplace.",
    detail: "Listing review, publisher approval, review moderation, and order management — including real refunds for marketplace purchases.",
  },
  {
    title: "Disaster Recovery",
    description: "A documented, runnable recovery process.",
    detail: "Automated nightly checksummed backups, with a concrete restore runbook and honestly-stated recovery time estimates — not a guaranteed SLA.",
  },
];

// ---------- Architecture-only: genuinely not built yet ----------
// Confirmed absent by direct code search — never claim these exist.

export const ADMIN_COMING_SOON: ComingSoonResource[] = [
  { title: "Organization Directory", description: "A unified, platform-wide view of every organization with plan, health, and usage at a glance." },
  { title: "Platform-Wide User Management", description: "Searching and managing users across every organization from one place." },
  { title: "Session Manager", description: "Platform-wide visibility into active sessions, beyond each user's own self-service device list." },
  { title: "Visual Permissions Matrix", description: "A role-by-permission management view — authorization itself is real and enforced today, this is about visual management tooling." },
  { title: "Dedicated Security Events Console", description: "A standalone, filterable view of security events — today they surface inside system health monitoring and as auto-opened incidents." },
  { title: "Notification Center", description: "Centralized delivery-status management for outbound notifications." },
  { title: "Executive Platform Analytics", description: "A dedicated cross-metric analytics view beyond what's already in Billing." },
  { title: "Platform-Level Integration Console", description: "Oversight of every organization's connected integrations from one place." },
  { title: "Global Platform Settings UI", description: "Managing branding, auth, and provider configuration without editing environment variables directly." },
  { title: "AI-Driven Platform Insights", description: "Automated, data-driven recommendations for platform operators." },
];
