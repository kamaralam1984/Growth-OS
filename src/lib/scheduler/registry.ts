import { prisma } from "@/lib/prisma";
import { ensureTodaySnapshot } from "@/lib/analytics";
import { ensureTodayProjectHealthSnapshot } from "@/lib/projects/health-score";
import { startSystemTriggeredExecutiveMeeting } from "@/lib/ai/meeting-lifecycle";
import { startDeliveryBoardMeeting, runDeliveryBoardRound } from "@/lib/ai/delivery-board-orchestrator";
import { advanceSequenceCore } from "@/app/dashboard/outreach/_lib/sequence-actions";
import { fireOverdueIfApplicable } from "@/app/dashboard/crm/_lib/task-actions";
import { fireOverdueIfApplicable as fireInvoiceOverdueIfApplicable } from "@/app/dashboard/proposal/_lib/invoice-actions";
import { isAIConnected } from "@/lib/ai/client";
import { notifyUser } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";
import { evaluateAlerts } from "@/lib/alerts/engine";
import { runAndRecordFullSystemCheck } from "@/lib/monitoring/aggregate";
import type { JobDefinition, JobRunLog } from "./types";

const DELIVERY_ROUNDS_PER_MEETING = 2;
const AUDIT_LOG_RETENTION_DAYS = 400;
// Judgment call: LinkedIn sending is manual by design (the user pastes the
// message themselves), so a draft sitting APPROVED/QUEUED isn't a bug — but
// 2 days idle is long enough that it's likely forgotten, not just "later
// today." Short enough to still be a useful nudge on an outreach cadence.
const LINKEDIN_REMINDER_THRESHOLD_DAYS = 2;
// Judgment call: a proposal sitting SENT with zero response for 5 days is
// long enough that the owner has likely moved on to other work and forgotten
// to chase it, but short enough that the nudge still lands while following
// up is natural rather than awkward.
const PROPOSAL_FOLLOWUP_THRESHOLD_DAYS = 5;
// Judgment call: 3 days catches an invoice both while it's still "due soon"
// (a useful heads-up before the due date) and right after it's "just gone
// overdue" (still fresh enough that a nudge reads as helpful, not nagging).
const INVOICE_DUE_REMINDER_WINDOW_DAYS = 3;

/**
 * Every job below delegates to a real, already-shipped (or newly-added)
 * business function — nothing here is a no-op or a placeholder that merely
 * pretends to do work. Jobs named in the original brief whose underlying
 * feature doesn't exist YET (CRM follow-up reminders, lead-scoring refresh,
 * opportunity/website rescans, cold-email/LinkedIn scheduling, proposal/
 * invoice/subscription reminders, weekly/monthly executive reports, AI
 * memory consolidation, knowledge-base indexing, cache cleanup) are
 * intentionally NOT registered here — each is added in the batch that
 * builds its underlying feature (see /home/server/.claude/plans for the
 * batch plan), rather than faking a job that would run and do nothing.
 */

async function dailyMetricSnapshotJob(): Promise<JobRunLog[]> {
  const orgs = await prisma.organization.findMany({ select: { id: true } });
  const logs: JobRunLog[] = [];
  for (const org of orgs) {
    try {
      await ensureTodaySnapshot(org.id);
    } catch (error) {
      logs.push({ level: "error", message: error instanceof Error ? error.message : String(error), organizationId: org.id });
    }
  }
  logs.push({ level: "info", message: `Snapshotted ${orgs.length} organization(s).` });
  return logs;
}

async function dailyProjectHealthSnapshotJob(): Promise<JobRunLog[]> {
  const projects = await prisma.project.findMany({
    where: { status: { in: ["PLANNING", "ACTIVE", "ON_HOLD"] } },
    select: { id: true, organizationId: true },
  });
  const logs: JobRunLog[] = [];
  for (const project of projects) {
    try {
      await ensureTodayProjectHealthSnapshot(project.id, project.organizationId);
    } catch (error) {
      logs.push({ level: "error", message: error instanceof Error ? error.message : String(error), organizationId: project.organizationId });
    }
  }
  logs.push({ level: "info", message: `Snapshotted health for ${projects.length} active project(s).` });
  return logs;
}

async function dailyExecutiveBoardMeetingJob(): Promise<JobRunLog[]> {
  if (!isAIConnected()) return [{ level: "warn", message: "Skipped — ANTHROPIC_API_KEY not configured." }];
  const orgs = await prisma.organization.findMany({ select: { id: true } });
  const logs: JobRunLog[] = [];
  for (const org of orgs) {
    try {
      const result = await startSystemTriggeredExecutiveMeeting(org.id);
      logs.push(
        "meetingId" in result && result.meetingId
          ? { level: "info", message: `Started meeting ${result.meetingId}.`, organizationId: org.id }
          : { level: "info", message: `Skipped: ${result.skippedReason}.`, organizationId: org.id },
      );
    } catch (error) {
      logs.push({ level: "error", message: error instanceof Error ? error.message : String(error), organizationId: org.id });
    }
  }
  return logs;
}

async function dailyDeliveryBoardMeetingJob(): Promise<JobRunLog[]> {
  if (!isAIConnected()) return [{ level: "warn", message: "Skipped — ANTHROPIC_API_KEY not configured." }];
  const projects = await prisma.project.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, organizationId: true, ownerUserId: true },
  });
  const logs: JobRunLog[] = [];

  for (const project of projects) {
    try {
      const alreadyToday = await prisma.meeting.findFirst({
        where: {
          relatedProjectId: project.id,
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
        select: { id: true },
      });
      if (alreadyToday) {
        logs.push({ level: "info", message: `Skipped project ${project.id}: already ran today.`, organizationId: project.organizationId });
        continue;
      }

      let userId = project.ownerUserId;
      if (!userId) {
        const owner = await prisma.membership.findFirst({
          where: { organizationId: project.organizationId, status: "ACTIVE", role: "OWNER" },
          orderBy: { createdAt: "asc" },
          select: { userId: true },
        });
        userId = owner?.userId ?? null;
      }
      if (!userId) {
        logs.push({ level: "warn", message: `Skipped project ${project.id}: no owner user to act as convener.`, organizationId: project.organizationId });
        continue;
      }

      const { meetingId } = await startDeliveryBoardMeeting(project.id, userId);
      for (let round = 0; round < DELIVERY_ROUNDS_PER_MEETING; round += 1) {
        await runDeliveryBoardRound(meetingId);
      }
      logs.push({ level: "info", message: `Started delivery meeting ${meetingId} for project ${project.id}.`, organizationId: project.organizationId });
    } catch (error) {
      logs.push({ level: "error", message: error instanceof Error ? error.message : String(error), organizationId: project.organizationId });
    }
  }
  return logs;
}

/**
 * Runs the same idempotent "has enough time passed since the last SENT
 * draft" check that advanceSequence performs on page view — this job adds
 * no new business logic, it's just what makes that check fire on a regular
 * cron tick instead of only when a user happens to visit the outreach page.
 * "Active in a sequence" is derived from EmailDraft rows (there is no
 * separate enrollment/status model): every distinct (contactId, sequenceId)
 * pair with at least one draft is a candidate, and advanceSequenceCore's own
 * idempotency guard (already complete / not yet due) makes it safe to call
 * on pairs that aren't actually due this run.
 */
async function sequenceAdvancementJob(): Promise<JobRunLog[]> {
  const orgs = await prisma.organization.findMany({ select: { id: true } });
  const logs: JobRunLog[] = [];

  for (const org of orgs) {
    const pairs = await prisma.emailDraft.groupBy({
      by: ["contactId", "sequenceId"],
      where: { organizationId: org.id, sequenceId: { not: null } },
    });

    for (const pair of pairs) {
      if (!pair.sequenceId) continue;
      try {
        const result = await advanceSequenceCore(pair.contactId, pair.sequenceId, org.id);
        if (!result.ok) {
          logs.push({ level: "error", message: `Contact ${pair.contactId} / sequence ${pair.sequenceId}: ${result.error}`, organizationId: org.id });
        } else if (result.advanced) {
          logs.push({
            level: "info",
            message: `Advanced contact ${pair.contactId} in sequence ${pair.sequenceId} to step ${result.draft?.sequenceStepIndex}.`,
            organizationId: org.id,
          });
        } else if (result.complete) {
          logs.push({ level: "info", message: `Contact ${pair.contactId} / sequence ${pair.sequenceId}: sequence complete.`, organizationId: org.id });
        } else {
          logs.push({ level: "info", message: `Contact ${pair.contactId} / sequence ${pair.sequenceId}: not due yet.`, organizationId: org.id });
        }
      } catch (error) {
        logs.push({
          level: "error",
          message: `Contact ${pair.contactId} / sequence ${pair.sequenceId}: ${error instanceof Error ? error.message : String(error)}`,
          organizationId: org.id,
        });
      }
    }
  }

  return logs;
}

/**
 * LinkedIn sending is manual by design — this app never automates LinkedIn,
 * the user pastes the message themselves and confirms via
 * markLinkedInDraftSent (src/app/dashboard/outreach/_lib/approval-actions.ts).
 * A LINKEDIN draft sits APPROVED or QUEUED (both are "ready, waiting on the
 * human") until that confirmation. This job nudges whoever should send it —
 * the contact's assigned owner, falling back to the org's OWNER the same way
 * dailyDeliveryBoardMeetingJob does — once the draft has been ready for
 * longer than LINKEDIN_REMINDER_THRESHOLD_DAYS, and only once per draft
 * (reminderSentAt) so it doesn't spam on every daily tick.
 */
async function linkedInReminderJob(): Promise<JobRunLog[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - LINKEDIN_REMINDER_THRESHOLD_DAYS);

  const drafts = await prisma.emailDraft.findMany({
    where: {
      channel: "LINKEDIN",
      reminderSentAt: null,
      OR: [
        { status: "APPROVED", approvedAt: { lt: cutoff } },
        { status: "QUEUED", queuedAt: { lt: cutoff } },
      ],
    },
    include: { contact: { include: { company: true } } },
  });

  const logs: JobRunLog[] = [];

  for (const draft of drafts) {
    try {
      const readySince = draft.status === "QUEUED" ? draft.queuedAt : draft.approvedAt;
      const daysReady = readySince
        ? Math.floor((Date.now() - readySince.getTime()) / (1000 * 60 * 60 * 24))
        : LINKEDIN_REMINDER_THRESHOLD_DAYS;

      let userId = draft.contact.ownerUserId;
      if (!userId) {
        const owner = await prisma.membership.findFirst({
          where: { organizationId: draft.organizationId, status: "ACTIVE", role: "OWNER" },
          orderBy: { createdAt: "asc" },
          select: { userId: true },
        });
        userId = owner?.userId ?? null;
      }
      if (!userId) {
        logs.push({ level: "warn", message: `Skipped draft ${draft.id}: no owner user to remind.`, organizationId: draft.organizationId });
        continue;
      }

      const contactLabel = `${draft.contact.firstName}${draft.contact.company?.name ? ` at ${draft.contact.company.name}` : ""}`;
      const message = `Your LinkedIn message to ${contactLabel} has been ready for ${daysReady} day(s) — don't forget to send it and confirm.`;

      await notifyUser({
        userId,
        organizationId: draft.organizationId,
        type: "EMAIL_READY",
        title: "LinkedIn message ready to send",
        message,
      });

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, preference: { select: { emailNotifications: true } } },
      });
      if (user?.email && (user.preference?.emailNotifications ?? true)) {
        await sendEmail({
          to: user.email,
          subject: "LinkedIn message ready to send",
          text: message,
        });
      }

      await prisma.emailDraft.update({ where: { id: draft.id }, data: { reminderSentAt: new Date() } });
      logs.push({ level: "info", message: `Reminded ${userId} about draft ${draft.id} (${daysReady} day(s) ready).`, organizationId: draft.organizationId });
    } catch (error) {
      logs.push({ level: "error", message: error instanceof Error ? error.message : String(error), organizationId: draft.organizationId });
    }
  }

  return logs;
}

async function auditLogRetentionCleanupJob(): Promise<JobRunLog[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - AUDIT_LOG_RETENTION_DAYS);
  const result = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return [{ level: "info", message: `Pruned ${result.count} audit log row(s) older than ${AUDIT_LOG_RETENTION_DAYS} days.` }];
}

/**
 * Real-time fix for the CRM audit's flagged gap: overdue-task detection was
 * previously "evaluated-on-write/on-view rather than true real-time" (see
 * task-actions.ts's fireOverdueIfApplicable). This job calls that exact same
 * function — same dedup guard (overdueNotifiedAt), same TASK_OVERDUE
 * automation trigger — for every task that's overdue right now across every
 * organization, so detection no longer depends on someone opening the task.
 */
async function overdueTaskDetectionJob(): Promise<JobRunLog[]> {
  const tasks = await prisma.task.findMany({
    where: {
      dueDate: { lt: new Date() },
      overdueNotifiedAt: null,
      status: { notIn: ["COMPLETED", "CANCELLED"] },
    },
    select: { id: true, organizationId: true, title: true, dueDate: true, status: true, overdueNotifiedAt: true },
  });

  const logs: JobRunLog[] = [];
  for (const task of tasks) {
    try {
      await fireOverdueIfApplicable(task.organizationId, task);
      logs.push({ level: "info", message: `Flagged overdue task "${task.title}".`, organizationId: task.organizationId });
    } catch (error) {
      logs.push({ level: "error", message: error instanceof Error ? error.message : String(error), organizationId: task.organizationId });
    }
  }
  return logs;
}

/**
 * A proposal sitting in SENT status with no ACCEPTED/REJECTED response is
 * easy to lose track of once the owner moves on to other work — this job
 * nudges the creator (falling back to the org's OWNER, same pattern as
 * dailyDeliveryBoardMeetingJob/linkedInReminderJob) once it's been sent for
 * longer than PROPOSAL_FOLLOWUP_THRESHOLD_DAYS, and only once per proposal
 * (reminderSentAt) so it doesn't re-notify on every tick.
 */
async function proposalFollowUpReminderJob(): Promise<JobRunLog[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - PROPOSAL_FOLLOWUP_THRESHOLD_DAYS);

  const proposals = await prisma.proposal.findMany({
    where: {
      status: "SENT",
      reminderSentAt: null,
      sentAt: { lt: cutoff },
    },
    select: { id: true, organizationId: true, title: true, sentAt: true, createdByUserId: true },
  });

  const logs: JobRunLog[] = [];

  for (const proposal of proposals) {
    try {
      const daysSince = proposal.sentAt
        ? Math.floor((Date.now() - proposal.sentAt.getTime()) / (1000 * 60 * 60 * 24))
        : PROPOSAL_FOLLOWUP_THRESHOLD_DAYS;

      let userId = proposal.createdByUserId;
      if (!userId) {
        const owner = await prisma.membership.findFirst({
          where: { organizationId: proposal.organizationId, status: "ACTIVE", role: "OWNER" },
          orderBy: { createdAt: "asc" },
          select: { userId: true },
        });
        userId = owner?.userId ?? null;
      }
      if (!userId) {
        logs.push({ level: "warn", message: `Skipped proposal ${proposal.id}: no owner user to remind.`, organizationId: proposal.organizationId });
        continue;
      }

      const message = `Your proposal "${proposal.title}" was sent ${daysSince} day(s) ago with no response yet — consider following up.`;

      await notifyUser({
        userId,
        organizationId: proposal.organizationId,
        type: "PROPOSAL_SENT",
        title: "Proposal follow-up reminder",
        message,
      });

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, preference: { select: { emailNotifications: true } } },
      });
      if (user?.email && (user.preference?.emailNotifications ?? true)) {
        await sendEmail({
          to: user.email,
          subject: "Proposal follow-up reminder",
          text: message,
        });
      }

      await prisma.proposal.update({ where: { id: proposal.id }, data: { reminderSentAt: new Date() } });
      logs.push({ level: "info", message: `Reminded ${userId} to follow up on proposal ${proposal.id} (${daysSince} day(s) since sent).`, organizationId: proposal.organizationId });
    } catch (error) {
      logs.push({ level: "error", message: error instanceof Error ? error.message : String(error), organizationId: proposal.organizationId });
    }
  }

  return logs;
}

/**
 * Two real, distinct effects, logged separately:
 *
 * 1. Status transition — reuses invoice-actions.ts's fireOverdueIfApplicable
 *    (now exported) on every genuinely-unpaid SENT invoice past its due
 *    date, instead of duplicating that update here. That function already
 *    exists and is documented as firing "on write" only (same limitation as
 *    CRM Task's TASK_OVERDUE); this job gives it the same real-time cadence
 *    overdueTaskDetectionJob already gives the task version, so an invoice
 *    no one happens to touch still flips to OVERDUE on schedule rather than
 *    staying SENT forever.
 * 2. Reminder — nudges whoever should chase payment (the invoice's creator,
 *    falling back to the org's OWNER membership) once per invoice
 *    (reminderSentAt dedup) while it's within
 *    INVOICE_DUE_REMINDER_WINDOW_DAYS of its due date, either side.
 */
async function invoiceDueReminderJob(): Promise<JobRunLog[]> {
  const logs: JobRunLog[] = [];
  const now = new Date();

  const pastDueSent = await prisma.invoice.findMany({
    where: { status: "SENT", dueDate: { lt: now } },
    select: { id: true, organizationId: true, invoiceNumber: true, dueDate: true, status: true, grandTotal: true, amountPaid: true },
  });

  for (const invoice of pastDueSent) {
    if (invoice.amountPaid >= invoice.grandTotal) continue;
    try {
      await fireInvoiceOverdueIfApplicable(invoice.organizationId, invoice);
      logs.push({ level: "info", message: `Transitioned invoice ${invoice.invoiceNumber} to OVERDUE.`, organizationId: invoice.organizationId });
    } catch (error) {
      logs.push({ level: "error", message: error instanceof Error ? error.message : String(error), organizationId: invoice.organizationId });
    }
  }

  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - INVOICE_DUE_REMINDER_WINDOW_DAYS);
  const windowEnd = new Date(now);
  windowEnd.setDate(windowEnd.getDate() + INVOICE_DUE_REMINDER_WINDOW_DAYS);

  const dueSoonOrOverdue = await prisma.invoice.findMany({
    where: {
      status: { in: ["SENT", "OVERDUE"] },
      reminderSentAt: null,
      dueDate: { gte: windowStart, lte: windowEnd },
    },
    select: { id: true, organizationId: true, invoiceNumber: true, dueDate: true, status: true, grandTotal: true, amountPaid: true, createdByUserId: true },
  });

  for (const invoice of dueSoonOrOverdue) {
    if (invoice.amountPaid >= invoice.grandTotal || !invoice.dueDate) continue;
    try {
      let userId = invoice.createdByUserId;
      if (!userId) {
        const owner = await prisma.membership.findFirst({
          where: { organizationId: invoice.organizationId, status: "ACTIVE", role: "OWNER" },
          orderBy: { createdAt: "asc" },
          select: { userId: true },
        });
        userId = owner?.userId ?? null;
      }
      if (!userId) {
        logs.push({ level: "warn", message: `Skipped invoice ${invoice.invoiceNumber}: no owner user to remind.`, organizationId: invoice.organizationId });
        continue;
      }

      const remaining = invoice.grandTotal - invoice.amountPaid;
      const dueDateLabel = invoice.dueDate.toISOString().slice(0, 10);
      const message = `Invoice ${invoice.invoiceNumber} for ${remaining.toFixed(2)} is ${invoice.status === "OVERDUE" ? "overdue" : "due soon"} (due ${dueDateLabel}).`;

      await notifyUser({
        userId,
        organizationId: invoice.organizationId,
        type: "DEADLINE_APPROACHING",
        title: invoice.status === "OVERDUE" ? "Invoice overdue" : "Invoice due soon",
        message,
      });

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, preference: { select: { emailNotifications: true } } },
      });
      if (user?.email && (user.preference?.emailNotifications ?? true)) {
        await sendEmail({
          to: user.email,
          subject: invoice.status === "OVERDUE" ? "Invoice overdue" : "Invoice due soon",
          text: message,
        });
      }

      await prisma.invoice.update({ where: { id: invoice.id }, data: { reminderSentAt: new Date() } });
      logs.push({ level: "info", message: `Reminded ${userId} about invoice ${invoice.invoiceNumber} (${invoice.status === "OVERDUE" ? "overdue" : "due soon"}).`, organizationId: invoice.organizationId });
    } catch (error) {
      logs.push({ level: "error", message: error instanceof Error ? error.message : String(error), organizationId: invoice.organizationId });
    }
  }

  return logs;
}

/**
 * Real Smart Alerts rule engine (src/lib/alerts/rules.ts + engine.ts) run
 * hourly for every organization — the production-grade cron path, not a
 * lazy-only "only evaluates when someone opens the Alert Center" shortcut.
 * evaluateAlerts already never throws its per-rule failures out to the
 * caller in a way that stops other orgs; this job's try/catch exists purely
 * to keep one organization's DB error from stopping the loop over the rest.
 */
async function smartAlertsEvaluationJob(): Promise<JobRunLog[]> {
  const orgs = await prisma.organization.findMany({ select: { id: true } });
  const logs: JobRunLog[] = [];
  for (const org of orgs) {
    try {
      await evaluateAlerts(org.id);
      logs.push({ level: "info", message: `Evaluated Smart Alerts.`, organizationId: org.id });
    } catch (error) {
      logs.push({ level: "error", message: error instanceof Error ? error.message : String(error), organizationId: org.id });
    }
  }
  return logs;
}

/**
 * Periodic infra health snapshot — runs the exact same real check/persist/
 * alert pipeline as the public GET /api/health route (src/lib/monitoring/
 * aggregate.ts's runAndRecordFullSystemCheck), so SystemHealthSnapshot rows
 * (and SystemAlert reconciliation) keep accruing on a real cadence even
 * during a stretch with no external traffic hitting /api/health at all.
 */
async function healthSnapshotJob(): Promise<JobRunLog[]> {
  const result = await runAndRecordFullSystemCheck();
  return [
    {
      level: result.overall === "DOWN" ? "error" : result.overall === "DEGRADED" ? "warn" : "info",
      message: `Overall: ${result.overall}. ${result.components.map((c) => `${c.component}=${c.status}`).join(", ")}`,
    },
  ];
}

export const JOB_DEFINITIONS: JobDefinition[] = [
  {
    key: "daily-metric-snapshot",
    name: "Daily analytics snapshot",
    cronExpression: "15 0 * * *",
    handler: dailyMetricSnapshotJob,
    retryPolicy: { maxAttempts: 2, backoffMs: 30_000 },
    priority: 5, // pure background housekeeping — nothing user-facing blocks on it landing at a particular moment
  },
  {
    key: "daily-project-health-snapshot",
    name: "Daily project health snapshot",
    cronExpression: "30 0 * * *",
    handler: dailyProjectHealthSnapshotJob,
    retryPolicy: { maxAttempts: 2, backoffMs: 30_000 },
    priority: 5, // same as the analytics snapshot — a nightly derived rollup, not urgent
  },
  {
    key: "daily-executive-board-meeting",
    name: "Daily AI Executive Board meeting",
    cronExpression: "0 9 * * 1-5",
    handler: dailyExecutiveBoardMeetingJob,
    retryPolicy: { maxAttempts: 1, backoffMs: 0 },
    priority: 3, // user-visible AI output, but scheduled once a day with no tight downstream deadline
  },
  {
    key: "daily-delivery-board-meeting",
    name: "Daily AI Delivery Board meeting",
    cronExpression: "30 9 * * 1-5",
    handler: dailyDeliveryBoardMeetingJob,
    retryPolicy: { maxAttempts: 1, backoffMs: 0 },
    priority: 3, // same tier as the executive board meeting — daily AI cadence, not time-critical
  },
  {
    key: "audit-log-retention-cleanup",
    name: "Audit log retention cleanup",
    cronExpression: "0 2 * * 0",
    handler: auditLogRetentionCleanupJob,
    retryPolicy: { maxAttempts: 2, backoffMs: 60_000 },
    priority: 5, // weekly bulk deletion housekeeping — lowest priority, no user waits on it
  },
  {
    key: "sequence-advancement",
    name: "Cold-email sequence advancement",
    cronExpression: "0 * * * *",
    handler: sequenceAdvancementJob,
    retryPolicy: { maxAttempts: 2, backoffMs: 30_000 },
    priority: 3, // outreach cadence matters but is measured in hours/days, not minutes
  },
  {
    key: "linkedin-draft-reminder",
    name: "LinkedIn draft reminder",
    cronExpression: "0 10 * * *",
    handler: linkedInReminderJob,
    retryPolicy: { maxAttempts: 2, backoffMs: 30_000 },
    priority: 3, // a reminder nudge, not a live user-facing action — same tier as other daily reminders
  },
  {
    key: "overdue-task-detection",
    name: "Overdue task detection",
    cronExpression: "*/30 * * * *",
    handler: overdueTaskDetectionJob,
    retryPolicy: { maxAttempts: 2, backoffMs: 30_000 },
    priority: 1, // runs every 30 minutes and drives real-time user-facing overdue notifications — highest urgency
  },
  {
    key: "proposal-follow-up-reminder",
    name: "Proposal follow-up reminder",
    cronExpression: "0 9 * * *",
    handler: proposalFollowUpReminderJob,
    retryPolicy: { maxAttempts: 2, backoffMs: 30_000 },
    priority: 3, // daily reminder nudge, same tier as the other once-a-day reminder jobs
  },
  {
    key: "invoice-due-reminder",
    name: "Invoice due/overdue reminder",
    cronExpression: "45 9 * * *",
    handler: invoiceDueReminderJob,
    retryPolicy: { maxAttempts: 2, backoffMs: 30_000 },
    priority: 2, // touches money (invoice overdue status + payment-chasing reminder) — more urgent than a plain reminder, just below real-time alerts
  },
  {
    key: "smart-alerts-evaluation",
    name: "Smart Alerts evaluation",
    cronExpression: "15 * * * *",
    handler: smartAlertsEvaluationJob,
    retryPolicy: { maxAttempts: 2, backoffMs: 30_000 },
    priority: 1, // hourly, user-facing alert engine — same top tier as overdue detection since staleness directly degrades the Alert Center
  },
  {
    key: "health-snapshot",
    name: "Infrastructure health snapshot",
    cronExpression: "*/5 * * * *",
    handler: healthSnapshotJob,
    retryPolicy: { maxAttempts: 1, backoffMs: 0 }, // a missed snapshot is fine — the next run in 5 minutes covers it, no point retrying a stale check
    priority: 2, // frequent (every 5 min) and feeds real-time alerting/uptime history — high urgency, just below the strictly real-time user-facing jobs
  },
];
