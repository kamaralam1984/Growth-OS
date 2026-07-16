import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

/**
 * The 9 prebuilt AutomationTemplate rows shown in the Workflow Automation
 * Engine's Template Marketplace (/dashboard/automation/templates). Every
 * `config` field name below is real — it matches exactly what
 * NODE_CONFIG_SCHEMAS[nodeType] (src/lib/validations/workflow-node-configs.ts)
 * validates and what that nodeType's real executor
 * (src/lib/workflows/node-executors/*.ts) actually reads. installTemplate()
 * (src/lib/workflows/templates.ts) re-validates every step against those
 * same schemas before creating anything, so a stale template can never
 * silently install a broken workflow.
 *
 * Two hard, real constraints shaped every template below — documented once
 * here rather than repeated per template:
 *
 * 1. Only AI_ACTION's `prompt` field is interpolated (real {{dotted.path}}
 *    substitution against the run's triggerPayload + prior step outputs —
 *    see ai-and-data.ts's interpolateTemplate). EMAIL/SMS/NOTIFICATION's
 *    to/from/subject/body/title/message fields are NOT interpolated — they
 *    are genuinely static text, so no template below tries to inject
 *    trigger data into them; instead those steps use `notifyAllOwners`
 *    (needs no per-org address) or the org edits the field after installing.
 * 2. CRM/PROJECT/PROPOSAL/DOCUMENT/APPROVAL node configs need a real,
 *    specific id (dealId/docId/...) baked in at config time — there is no
 *    mechanism to bind a step's config to *this run's* trigger payload for
 *    those node types (only CONDITION/LOOP resolve a config field as a path
 *    against real run data, and only AI_ACTION interpolates a prompt
 *    string). A recurring, event-fired template can therefore never safely
 *    use one of those five node types (a baked-in id would misfire on every
 *    future run). Every template below instead does the "smart" dynamic
 *    work in an AI_ACTION step (which genuinely can read this run's real
 *    trigger data) and hands off the mechanical action (convert deal to
 *    project, seed milestones, send the proposal) to a human via a real
 *    Notification, pointing at where to do it in the dashboard. FUNCTION and
 *    DATABASE steps ARE used below where the org-level computation needs no
 *    per-run id at all (computePipelineTotals/computeCompanyHealth).
 *
 * `{{steps.N.field}}` in a `prompt` is this template layer's own extra
 * convention — installTemplate() rewrites it to the real
 * `{{stepOutputs.<install-time step id>.field}}` place-holder before saving,
 * since the seed can't know a step's real id ahead of install. Every other
 * `{{...}}` placeholder is a genuine triggerPayload field, sourced from the
 * real fireWorkflowTrigger() call site for that triggerType (grepped across
 * src/app at the time this file was written — see each template's
 * description for the exact call site).
 *
 * `stepsBlueprint` ordering: each step carries a local `order` (1-based,
 * unique within the template) instead of a real WorkflowStep id.
 * `onTrueOrder`/`onFalseOrder` on a CONDITION step point at another step's
 * `order`. A step with neither a CONDITION type nor further branches simply
 * falls through to the next-highest `order`. `position` is the canvas
 * {x, y} the visual builder renders the node at post-install.
 */

interface StepBlueprint {
  order: number;
  nodeType:
    | "TRIGGER"
    | "CONDITION"
    | "DELAY"
    | "LOOP"
    | "AI_ACTION"
    | "EMAIL"
    | "SMS"
    | "WEBHOOK"
    | "CRM"
    | "PROPOSAL"
    | "PROJECT"
    | "APPROVAL"
    | "DOCUMENT"
    | "NOTIFICATION"
    | "DATABASE"
    | "FUNCTION"
    | "CUSTOM_API";
  name: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
  onTrueOrder?: number;
  onFalseOrder?: number;
}

interface TemplateSeed {
  name: string;
  description: string;
  category: string;
  icon?: string;
  popular: boolean;
  triggerType: Prisma.AutomationTemplateCreateInput["triggerType"];
  triggerConfig?: Record<string, unknown>;
  stepsBlueprint: StepBlueprint[];
}

export const AUTOMATION_TEMPLATES: TemplateSeed[] = [
  {
    name: "Lead Follow-up",
    description:
      "When a new Lead is created (LEAD_CREATED — src/app/dashboard/actions.ts, payload {leadId,name,company,email,estimatedValue}), waits a day, has AI draft a personalized follow-up email, then notifies the org's owners to review and send it.",
    category: "Sales",
    icon: "user-plus",
    popular: true,
    triggerType: "LEAD_CREATED",
    stepsBlueprint: [
      { order: 1, nodeType: "TRIGGER", name: "Lead created", config: {}, position: { x: 0, y: 0 } },
      { order: 2, nodeType: "DELAY", name: "Wait 1 day", config: { seconds: 86400 }, position: { x: 320, y: 0 } },
      {
        order: 3,
        nodeType: "AI_ACTION",
        name: "Draft follow-up email",
        config: {
          prompt:
            'Draft a warm, specific follow-up email for the sales lead "{{name}}" at "{{company}}" (estimated deal value {{estimatedValue}}). Keep it under 120 words and end with a clear call to action.',
          personaType: "SALES",
        },
        position: { x: 640, y: 0 },
      },
      {
        order: 4,
        nodeType: "NOTIFICATION",
        name: "Notify owners",
        config: {
          notifyAllOwners: true,
          type: "CRM_EVENT",
          title: "Lead follow-up drafted",
          message: "A follow-up email draft is ready for a lead created a day ago — open this run's history to review and send it.",
        },
        position: { x: 960, y: 0 },
      },
    ],
  },
  {
    name: "Proposal Approval",
    description:
      'Manually triggered — for real per-proposal context, fire it via POST /api/v1/workflows/{id}/trigger (the "workflows:trigger" API key scope) with a JSON body like {"proposalId":"...","title":"...","value":12000}, which becomes this run\'s triggerPayload. AI assesses approval risk, then notifies owners to review before sending. There is no PROPOSAL_CREATED/PROPOSAL_DRAFTED value in the AutomationTrigger enum (only PROPOSAL_ACCEPTED/PROPOSAL_REJECTED, which fire after this decision is already made), so MANUAL + the API trigger route is the real way to run this per-proposal today.',
    category: "Sales",
    icon: "file-check",
    popular: false,
    triggerType: "MANUAL",
    stepsBlueprint: [
      { order: 1, nodeType: "TRIGGER", name: "Run for a proposal", config: {}, position: { x: 0, y: 0 } },
      {
        order: 2,
        nodeType: "AI_ACTION",
        name: "Assess approval risk",
        config: {
          prompt:
            'Assess the approval risk of sending the proposal "{{title}}" (value {{value}}) to the client. Note anything unusual about the value or scope, and recommend approve or hold.',
          personaType: "CEO",
        },
        position: { x: 320, y: 0 },
      },
      {
        order: 3,
        nodeType: "NOTIFICATION",
        name: "Notify owners",
        config: {
          notifyAllOwners: true,
          type: "BOARD_REVIEW_COMPLETED",
          title: "Proposal approval assessment ready",
          message: "An AI approval-risk assessment is ready — review it in this run's history before sending the proposal.",
        },
        position: { x: 640, y: 0 },
      },
    ],
  },
  {
    name: "Invoice Reminder",
    description:
      "When an invoice becomes overdue (INVOICE_OVERDUE — src/app/dashboard/proposal/_lib/invoice-actions.ts, payload {invoiceId,invoiceNumber,dueDate}), AI drafts a payment reminder and notifies owners; after 3 days, escalates. This build has no way to re-check Invoice.amountPaid from inside a workflow step (Invoice isn't in the DATABASE node's queryable-model whitelist), so the escalation is unconditional and says so — it does not silently assume the invoice is still unpaid.",
    category: "Finance",
    icon: "receipt",
    popular: true,
    triggerType: "INVOICE_OVERDUE",
    stepsBlueprint: [
      { order: 1, nodeType: "TRIGGER", name: "Invoice overdue", config: {}, position: { x: 0, y: 0 } },
      {
        order: 2,
        nodeType: "AI_ACTION",
        name: "Draft reminder",
        config: {
          prompt: "Draft a polite payment reminder for invoice {{invoiceNumber}}, which was due {{dueDate}} and is now overdue. Keep it under 100 words.",
        },
        position: { x: 320, y: 0 },
      },
      {
        order: 3,
        nodeType: "NOTIFICATION",
        name: "Notify owners",
        config: {
          notifyAllOwners: true,
          type: "CRITICAL_ALERT",
          title: "Invoice overdue",
          message: "An invoice is overdue — review the AI-drafted reminder in this run's history and send it.",
        },
        position: { x: 640, y: 0 },
      },
      { order: 4, nodeType: "DELAY", name: "Wait 3 days", config: { seconds: 259200 }, position: { x: 960, y: 0 } },
      {
        order: 5,
        nodeType: "NOTIFICATION",
        name: "Escalate",
        config: {
          notifyAllOwners: true,
          type: "CRITICAL_ALERT",
          title: "Invoice still overdue (unverified)",
          message: "3 days have passed since the first reminder. This workflow can't re-check payment status automatically — please confirm manually before escalating further.",
        },
        position: { x: 1280, y: 0 },
      },
    ],
  },
  {
    name: "Project Kickoff",
    description:
      "When a Project is created (PROJECT_CREATED — src/app/dashboard/projects/actions.ts and src/lib/projects/deal-conversion.ts, payload {projectId,name,companyId,clientId,budget}), AI drafts a kickoff checklist and notifies owners to seed milestones from the Project page. Milestone-seeding itself (seedStandardMilestones) needs this run's real projectId, which no PROJECT/FUNCTION/DATABASE node config can be bound to dynamically in this build — so that mechanical step stays a one-click human action, not a fabricated automatic one.",
    category: "Operations",
    icon: "rocket",
    popular: false,
    triggerType: "PROJECT_CREATED",
    stepsBlueprint: [
      { order: 1, nodeType: "TRIGGER", name: "Project created", config: {}, position: { x: 0, y: 0 } },
      {
        order: 2,
        nodeType: "AI_ACTION",
        name: "Draft kickoff checklist",
        config: {
          prompt: "A new project called \"{{name}}\" just kicked off with a budget of {{budget}}. Draft a short internal kickoff checklist covering milestones, resourcing, and the first client touchpoint.",
        },
        position: { x: 320, y: 0 },
      },
      {
        order: 3,
        nodeType: "NOTIFICATION",
        name: "Notify owners",
        config: {
          notifyAllOwners: true,
          type: "PROJECT_CREATED",
          title: "New project kicked off",
          message: "A new project was created — review the AI-drafted kickoff checklist in this run's history, then seed milestones from the Project page.",
        },
        position: { x: 640, y: 0 },
      },
    ],
  },
  {
    name: "Client Onboarding",
    description:
      "When a Deal is won (DEAL_WON — src/app/dashboard/crm/_lib/deal-actions.ts, payload {dealId,dealName,value,companyId}), AI drafts a client welcome message and internal kickoff-call agenda, then notifies owners to convert the deal to a project (the real convertWonDealToProject, which itself seeds milestones) from the Deal page — that conversion needs this run's real dealId, which no node config can be bound to dynamically here, so it stays a one-click human action.",
    category: "Client Success",
    icon: "handshake",
    popular: true,
    triggerType: "DEAL_WON",
    stepsBlueprint: [
      { order: 1, nodeType: "TRIGGER", name: "Deal won", config: {}, position: { x: 0, y: 0 } },
      {
        order: 2,
        nodeType: "AI_ACTION",
        name: "Draft welcome message",
        config: {
          prompt: 'A deal called "{{dealName}}" worth {{value}} was just won. Draft a warm client onboarding welcome message and a short internal kickoff-call agenda.',
        },
        position: { x: 320, y: 0 },
      },
      {
        order: 3,
        nodeType: "NOTIFICATION",
        name: "Notify owners",
        config: {
          notifyAllOwners: true,
          type: "PROJECT_CREATED",
          title: "Deal won — start onboarding",
          message: "A deal was won — convert it to a project from the Deal page and use the AI-drafted welcome message from this run's history.",
        },
        position: { x: 640, y: 0 },
      },
    ],
  },
  {
    name: "Weekly Reports",
    description:
      "Every Monday at 09:00 (CRON), computes this org's real pipeline totals (computePipelineTotals — no per-run id needed, safe as a static FUNCTION config), has AI write a 3-bullet executive summary from those real numbers, and notifies owners it's ready.",
    category: "Operations",
    icon: "bar-chart",
    popular: false,
    triggerType: "CRON",
    triggerConfig: { cronExpression: "0 9 * * 1" },
    stepsBlueprint: [
      { order: 1, nodeType: "TRIGGER", name: "Every Monday 09:00", config: {}, position: { x: 0, y: 0 } },
      {
        order: 2,
        nodeType: "FUNCTION",
        name: "Compute pipeline totals",
        config: { functionName: "computePipelineTotals" },
        position: { x: 320, y: 0 },
      },
      {
        order: 3,
        nodeType: "AI_ACTION",
        name: "Write executive summary",
        config: {
          prompt:
            "This week's real pipeline snapshot: {{steps.2.pipelineValue}} in open pipeline value across {{steps.2.totalLeadsCount}} leads, {{steps.2.wonValue}} won. Write a concise 3-bullet executive summary.",
        },
        position: { x: 640, y: 0 },
      },
      {
        order: 4,
        nodeType: "NOTIFICATION",
        name: "Notify owners",
        config: {
          notifyAllOwners: true,
          type: "NEW_RECOMMENDATION",
          title: "Weekly report ready",
          message: "This week's AI-summarized pipeline report is ready — review it in this run's history.",
        },
        position: { x: 960, y: 0 },
      },
    ],
  },
  {
    name: "CEO Summary",
    description:
      "Every day at 08:00 (CRON), computes this org's real company health scores (computeCompanyHealth — no per-run id needed), has the CEO Agent persona write a short daily executive summary from those real numbers, and notifies owners it's ready.",
    category: "Operations",
    icon: "sparkles",
    popular: false,
    triggerType: "CRON",
    triggerConfig: { cronExpression: "0 8 * * *" },
    stepsBlueprint: [
      { order: 1, nodeType: "TRIGGER", name: "Every day 08:00", config: {}, position: { x: 0, y: 0 } },
      {
        order: 2,
        nodeType: "FUNCTION",
        name: "Compute company health",
        config: { functionName: "computeCompanyHealth" },
        position: { x: 320, y: 0 },
      },
      {
        order: 3,
        nodeType: "AI_ACTION",
        name: "CEO Agent daily summary",
        config: {
          prompt:
            "Today's real company health scores: overall {{steps.2.overall}}, sales {{steps.2.sales}}, marketing {{steps.2.marketing}}, revenue {{steps.2.revenue}}, security {{steps.2.security}}. Write a short daily executive summary highlighting the biggest risk and the biggest win.",
          personaType: "CEO",
        },
        position: { x: 640, y: 0 },
      },
      {
        order: 4,
        nodeType: "NOTIFICATION",
        name: "Notify owners",
        config: {
          notifyAllOwners: true,
          type: "NEW_RECOMMENDATION",
          title: "CEO daily summary ready",
          message: "Today's AI-generated CEO summary is ready — review it in this run's history.",
        },
        position: { x: 960, y: 0 },
      },
    ],
  },
  {
    name: "Recruitment Workflow",
    description:
      'Manually triggered — for real per-candidate context, fire it via POST /api/v1/workflows/{id}/trigger with a JSON body like {"candidateName":"...","role":"..."}. AI drafts a next-steps email and notifies owners to review before sending. This app has no dedicated recruitment/ATS module (no Candidate model), so this is honestly a generic AI-draft-and-notify shape, not an integration with a nonexistent hiring pipeline.',
    category: "People Ops",
    icon: "users",
    popular: false,
    triggerType: "MANUAL",
    stepsBlueprint: [
      { order: 1, nodeType: "TRIGGER", name: "Run for a candidate", config: {}, position: { x: 0, y: 0 } },
      {
        order: 2,
        nodeType: "AI_ACTION",
        name: "Draft candidate outreach",
        config: {
          prompt: 'Draft a warm next-steps email for candidate "{{candidateName}}" who applied for the "{{role}}" role. Keep it under 100 words and professional.',
        },
        position: { x: 320, y: 0 },
      },
      {
        order: 3,
        nodeType: "NOTIFICATION",
        name: "Notify owners",
        config: {
          notifyAllOwners: true,
          type: "SYSTEM_NOTICE",
          title: "Candidate outreach drafted",
          message: "An AI-drafted next-steps email is ready for a candidate — review it in this run's history before sending.",
        },
        position: { x: 640, y: 0 },
      },
    ],
  },
  {
    name: "Customer Support",
    description:
      "When a client raises a message or ticket from the Client Portal (CLIENT_MESSAGE — src/app/portal/projects/[id]/actions.ts's raiseTicket, payload includes clientName + content or title/description), AI drafts a first response and notifies owners; after 4 hours, escalates. This build can't re-check the underlying Task's resolution status from inside a workflow step for this trigger, so the escalation is unconditional and says so.",
    category: "Client Success",
    icon: "life-buoy",
    popular: false,
    triggerType: "CLIENT_MESSAGE",
    stepsBlueprint: [
      { order: 1, nodeType: "TRIGGER", name: "Client raised a message", config: {}, position: { x: 0, y: 0 } },
      {
        order: 2,
        nodeType: "AI_ACTION",
        name: "Draft first response",
        config: {
          prompt: 'A client named "{{clientName}}" just sent a message on one of your projects: "{{content}}". Draft a prompt, empathetic first-response reply.',
        },
        position: { x: 320, y: 0 },
      },
      {
        order: 3,
        nodeType: "NOTIFICATION",
        name: "Notify owners",
        config: {
          notifyAllOwners: true,
          type: "CLIENT_COMMENT_ADDED",
          title: "Client message needs a response",
          message: "A client raised a message — review the AI-drafted first response in this run's history and reply from the Project page.",
        },
        position: { x: 640, y: 0 },
      },
      { order: 4, nodeType: "DELAY", name: "Wait 4 hours", config: { seconds: 14400 }, position: { x: 960, y: 0 } },
      {
        order: 5,
        nodeType: "NOTIFICATION",
        name: "Escalate",
        config: {
          notifyAllOwners: true,
          type: "CRITICAL_ALERT",
          title: "Client message may still be unresolved (unverified)",
          message: "4 hours have passed since this client message was raised. This workflow can't re-check its resolution status automatically — please confirm manually.",
        },
        position: { x: 1280, y: 0 },
      },
    ],
  },
];

/** Idempotent upsert-by-name, safe to call on every Template Marketplace page load (mirrors ensureMarketplaceCatalog's lazy-seed pattern) or from the one-off `npm run db:seed` script. */
export async function ensureAutomationTemplatesSeeded(): Promise<void> {
  for (const template of AUTOMATION_TEMPLATES) {
    await prisma.automationTemplate.upsert({
      where: { name: template.name },
      create: {
        name: template.name,
        description: template.description,
        category: template.category,
        icon: template.icon,
        popular: template.popular,
        triggerType: template.triggerType,
        triggerConfig: template.triggerConfig as Prisma.InputJsonValue | undefined,
        stepsBlueprint: template.stepsBlueprint as unknown as Prisma.InputJsonValue,
      },
      update: {
        description: template.description,
        category: template.category,
        icon: template.icon,
        popular: template.popular,
        triggerType: template.triggerType,
        triggerConfig: template.triggerConfig as Prisma.InputJsonValue | undefined,
        stepsBlueprint: template.stepsBlueprint as unknown as Prisma.InputJsonValue,
      },
    });
  }
}
