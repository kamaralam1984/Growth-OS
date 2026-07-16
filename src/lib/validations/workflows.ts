import { z } from "zod";

// Mirrors enum AutomationTrigger in prisma/schema.prisma — Workflow.triggerType
// reuses the same enum as the existing simple AutomationRule.trigger.
export const workflowTriggerTypeSchema = z.enum([
  "LEAD_CREATED",
  "TASK_COMPLETED",
  "MEETING_ENDED",
  "DECISION_MADE",
  "DEAL_STAGE_CHANGED",
  "DEAL_WON",
  "DEAL_LOST",
  "TASK_OVERDUE",
  "PROPOSAL_ACCEPTED",
  "PROPOSAL_REJECTED",
  "CONTRACT_SIGNED",
  "INVOICE_PAID",
  "INVOICE_OVERDUE",
  "LEAD_UPDATED",
  "PROJECT_CREATED",
  "CLIENT_MESSAGE",
  "MEETING_SCHEDULED",
  "WEBHOOK_RECEIVED",
  "TIMER",
  "CRON",
  "MANUAL",
]);
export type WorkflowTriggerTypeInput = z.infer<typeof workflowTriggerTypeSchema>;

export const workflowStatusSchema = z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]);
export type WorkflowStatusInput = z.infer<typeof workflowStatusSchema>;

export const workflowNodeTypeSchema = z.enum([
  "TRIGGER",
  "CONDITION",
  "DELAY",
  "LOOP",
  "AI_ACTION",
  "EMAIL",
  "SMS",
  "WEBHOOK",
  "CRM",
  "PROPOSAL",
  "PROJECT",
  "APPROVAL",
  "DOCUMENT",
  "NOTIFICATION",
  "DATABASE",
  "FUNCTION",
  "CUSTOM_API",
]);
export type WorkflowNodeTypeInput = z.infer<typeof workflowNodeTypeSchema>;

export const workflowPositionSchema = z.object({ x: z.number(), y: z.number() });
export type WorkflowPositionInput = z.infer<typeof workflowPositionSchema>;

export const createWorkflowSchema = z.object({
  name: z.string().trim().min(1, "Give the workflow a name.").max(200),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  triggerType: workflowTriggerTypeSchema,
  triggerConfig: z.record(z.string(), z.unknown()).optional(),
});
export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>;

export const updateWorkflowSchema = z.object({
  name: z.string().trim().min(1, "Give the workflow a name.").max(200).optional(),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  status: workflowStatusSchema.optional(),
  triggerType: workflowTriggerTypeSchema.optional(),
  triggerConfig: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateWorkflowInput = z.infer<typeof updateWorkflowSchema>;

// `config` is intentionally permissive here — its real shape depends on
// `nodeType` (EMAIL: {to, subject, template}, CONDITION: {field, operator,
// value}, CUSTOM_API: {url, method, headers}, etc). Validating each shape is
// that node type's own concern (its executor in a later batch), not this
// data layer's.
export const createWorkflowStepSchema = z.object({
  workflowId: z.string().min(1),
  nodeType: workflowNodeTypeSchema,
  name: z.string().trim().min(1, "Give the step a name.").max(200),
  config: z.record(z.string(), z.unknown()).default({}),
  position: workflowPositionSchema.optional(),
});
export type CreateWorkflowStepInput = z.infer<typeof createWorkflowStepSchema>;

export const updateWorkflowStepSchema = z.object({
  name: z.string().trim().min(1, "Give the step a name.").max(200).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  position: workflowPositionSchema.optional(),
});
export type UpdateWorkflowStepInput = z.infer<typeof updateWorkflowStepSchema>;

export const connectWorkflowStepsSchema = z.object({
  fromStepId: z.string().min(1),
  toStepId: z.string().min(1),
  branch: z.enum(["true", "false"]).optional(),
});
export type ConnectWorkflowStepsInput = z.infer<typeof connectWorkflowStepsSchema>;
