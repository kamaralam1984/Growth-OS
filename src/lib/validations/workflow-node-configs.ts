import { z } from "zod";

import { documentIndustrySchema, pricingModelSchema } from "@/lib/validations/proposal";
import { workflowNodeTypeSchema } from "@/lib/validations/workflows";
import { NotificationType } from "@/generated/prisma/enums";

// Per-node-type config schemas — one per WorkflowNodeType, each matching the
// exact shape its real executor in src/lib/workflows/node-executors/*.ts
// reads. This is the single source of truth for both the node property
// panel's client-side validation and (via safeParse before the Server
// Action call) the last line of defense before a bad config ever reaches
// updateWorkflowStepAction.

export const conditionOperatorSchema = z.enum([
  "equals",
  "not_equals",
  "contains",
  "greater_than",
  "less_than",
  "exists",
  "not_exists",
]);
export type ConditionOperatorInput = z.infer<typeof conditionOperatorSchema>;

export const conditionConfigSchema = z.object({
  field: z.string().trim().min(1, "Give the field a dotted path, e.g. dealId or stepOutputs.step1.dealId."),
  operator: conditionOperatorSchema,
  value: z.union([z.string(), z.number(), z.boolean()]),
});
export type ConditionConfigInput = z.infer<typeof conditionConfigSchema>;

function isValidIsoDate(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

export const delayConfigSchema = z
  .object({
    seconds: z.coerce.number().positive("Must be a positive number of seconds.").optional(),
    until: z
      .string()
      .trim()
      .refine((v) => v === "" || isValidIsoDate(v), "Must be a valid date.")
      .optional(),
  })
  .refine((v) => v.seconds !== undefined || (v.until !== undefined && v.until !== ""), {
    message: "Set either a duration in seconds or a resume date.",
    path: ["seconds"],
  })
  .refine((v) => !(v.seconds !== undefined && v.until !== undefined && v.until !== ""), {
    message: "Set only one of seconds or resume date, not both.",
    path: ["until"],
  });
export type DelayConfigInput = z.infer<typeof delayConfigSchema>;

export const loopConfigSchema = z.object({
  sourcePath: z.string().trim().min(1, "Give a dotted path to a real array, e.g. triggerPayload.items."),
  bodyNodeType: workflowNodeTypeSchema,
  bodyConfig: z.record(z.string(), z.unknown()).optional(),
  maxIterations: z.coerce.number().int().positive().max(1000).optional(),
});
export type LoopConfigInput = z.infer<typeof loopConfigSchema>;

// Matches ExecutiveAgentType in src/lib/ai/personas.ts — that module only
// exports iterators over the narrower 5-persona War Room subset
// (getAllPersonas), not the full PERSONAS key set that getPersona()/
// isKnownPersonaType() actually accept, so the full 13-value union is
// reproduced here directly from that file's own type definition.
export const personaTypeSchema = z.enum([
  "CEO",
  "SALES",
  "MARKETING",
  "PROPOSAL",
  "OUTREACH",
  "CRM",
  "ANALYTICS",
  "FINANCE",
  "LEGAL",
  "PROJECT_MANAGER",
  "QA_DIRECTOR",
  "DEVOPS_DIRECTOR",
  "DELIVERY_DIRECTOR",
]);
export type PersonaTypeInput = z.infer<typeof personaTypeSchema>;

export const outputFieldTypeSchema = z.enum(["string", "number", "boolean"]);
export type OutputFieldTypeInput = z.infer<typeof outputFieldTypeSchema>;

export const aiActionConfigSchema = z.object({
  prompt: z.string().trim().min(1, "Give the AI a prompt. {{dotted.path}} interpolates real trigger/step data."),
  personaType: personaTypeSchema.optional(),
  outputSchema: z.record(z.string(), outputFieldTypeSchema).optional(),
});
export type AiActionConfigInput = z.infer<typeof aiActionConfigSchema>;

export const emailConfigSchema = z.object({
  to: z.string().trim().min(1, "Give a recipient email address.").email("Must be a valid email address."),
  subject: z.string().trim().min(1, "Give the email a subject."),
  body: z.string().trim().min(1, "The email body can't be empty."),
});
export type EmailConfigInput = z.infer<typeof emailConfigSchema>;

export const smsConfigSchema = z.object({
  to: z.string().trim().min(1, "Give a recipient phone number, e.g. +15551234567."),
  from: z.string().trim().min(1, "Give the Twilio phone number to send from, e.g. +15559876543."),
  body: z.string().trim().min(1, "The SMS body can't be empty."),
});
export type SmsConfigInput = z.infer<typeof smsConfigSchema>;

export const httpMethodSchema = z.enum(["POST", "GET", "PUT", "PATCH", "DELETE"]);
export type HttpMethodInput = z.infer<typeof httpMethodSchema>;

export const webhookConfigSchema = z.object({
  url: z.string().trim().min(1, "Give a target URL.").url("Must be a valid http(s) URL."),
  method: httpMethodSchema.optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
});
export type WebhookConfigInput = z.infer<typeof webhookConfigSchema>;

export const customApiConfigSchema = webhookConfigSchema.extend({
  secretKey: z.string().trim().optional(),
  secretHeaderName: z.string().trim().optional(),
});
export type CustomApiConfigInput = z.infer<typeof customApiConfigSchema>;

export const notificationConfigSchema = z
  .object({
    recipientUserId: z.string().trim().optional(),
    notifyAllOwners: z.boolean().optional(),
    title: z.string().trim().min(1, "Give the notification a title."),
    message: z.string().trim().min(1, "Give the notification a message."),
    type: z.nativeEnum(NotificationType).optional(),
  })
  .refine((v) => (v.recipientUserId !== undefined && v.recipientUserId !== "") || v.notifyAllOwners === true, {
    message: "Choose a recipient user, or notify all owners.",
    path: ["recipientUserId"],
  });
export type NotificationConfigInput = z.infer<typeof notificationConfigSchema>;

export const crmCreateDealConfigSchema = z.object({
  action: z.literal("create_deal"),
  name: z.string().trim().min(1, "Give the deal a name."),
  value: z.coerce.number().nonnegative().optional(),
  companyId: z.string().trim().optional(),
  contactId: z.string().trim().optional(),
  dealStageId: z.string().trim().optional(),
});
export const crmUpdateDealStageConfigSchema = z.object({
  action: z.literal("update_deal_stage"),
  dealId: z.string().trim().min(1, "Choose a deal."),
  targetStageId: z.string().trim().min(1, "Choose a target pipeline stage."),
});
export const crmCreateContactConfigSchema = z.object({
  action: z.literal("create_contact"),
  firstName: z.string().trim().min(1, "Give the contact a first name."),
  lastName: z.string().trim().optional(),
  email: z.string().trim().min(1, "Give the contact an email address.").email("Must be a valid email address."),
  companyId: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  jobTitle: z.string().trim().optional(),
});
export const crmConfigSchema = z.discriminatedUnion("action", [
  crmCreateDealConfigSchema,
  crmUpdateDealStageConfigSchema,
  crmCreateContactConfigSchema,
]);
export type CrmConfigInput = z.infer<typeof crmConfigSchema>;

export const proposalConfigSchema = z.object({
  dealId: z.string().trim().optional(),
  companyId: z.string().trim().optional(),
  industry: documentIndustrySchema.optional(),
  title: z.string().trim().min(1, "Give the proposal a title."),
  brief: z.string().trim().optional(),
  pricingModel: pricingModelSchema.optional(),
  value: z.coerce.number().nonnegative().optional(),
});
export type ProposalConfigInput = z.infer<typeof proposalConfigSchema>;

export const projectConfigSchema = z
  .object({
    dealId: z.string().trim().optional(),
    name: z.string().trim().optional(),
  })
  .refine((v) => (v.dealId !== undefined && v.dealId !== "") || (v.name !== undefined && v.name !== ""), {
    message: 'Give the project a name, or link a won deal to convert via "dealId".',
    path: ["name"],
  });
export type ProjectConfigInput = z.infer<typeof projectConfigSchema>;

export const documentKindSchema = z.enum(["PROPOSAL", "QUOTATION", "CONTRACT", "INVOICE", "BUSINESS_DOCUMENT"]);
export type DocumentKindInput = z.infer<typeof documentKindSchema>;

export const documentConfigSchema = z.object({
  kind: documentKindSchema,
  docId: z.string().trim().min(1, "Give the document's id."),
  format: z.enum(["pdf", "docx"]),
});
export type DocumentConfigInput = z.infer<typeof documentConfigSchema>;

export const approvalConfigSchema = z.object({
  docKind: documentKindSchema,
  docId: z.string().trim().min(1, "Give the document's id."),
});
export type ApprovalConfigInput = z.infer<typeof approvalConfigSchema>;

export const queryableModelSchema = z.enum(["deal", "contact", "task", "company", "project"]);
export type QueryableModelInput = z.infer<typeof queryableModelSchema>;

export const queryableOperationSchema = z.enum(["findMany", "findFirst", "count"]);
export type QueryableOperationInput = z.infer<typeof queryableOperationSchema>;

export const databaseConfigSchema = z.object({
  model: queryableModelSchema,
  operation: queryableOperationSchema,
  where: z.record(z.string(), z.unknown()).optional(),
  select: z.record(z.string(), z.boolean()).optional(),
});
export type DatabaseConfigInput = z.infer<typeof databaseConfigSchema>;

export const internalFunctionNameSchema = z.enum([
  "scoreLeadNow",
  "computeCompanyHealth",
  "computePipelineTotals",
  "formatCurrency",
]);
export type InternalFunctionNameInput = z.infer<typeof internalFunctionNameSchema>;

export const functionConfigSchema = z.object({
  functionName: internalFunctionNameSchema,
  args: z.record(z.string(), z.unknown()).optional(),
});
export type FunctionConfigInput = z.infer<typeof functionConfigSchema>;

export const triggerConfigSchema = z.object({});
export type TriggerConfigInput = z.infer<typeof triggerConfigSchema>;

/** Total map over every WorkflowNodeType — the one source of truth the property panel validates against before every save. */
export const NODE_CONFIG_SCHEMAS = {
  TRIGGER: triggerConfigSchema,
  CONDITION: conditionConfigSchema,
  DELAY: delayConfigSchema,
  LOOP: loopConfigSchema,
  AI_ACTION: aiActionConfigSchema,
  EMAIL: emailConfigSchema,
  SMS: smsConfigSchema,
  WEBHOOK: webhookConfigSchema,
  CRM: crmConfigSchema,
  PROPOSAL: proposalConfigSchema,
  PROJECT: projectConfigSchema,
  APPROVAL: approvalConfigSchema,
  DOCUMENT: documentConfigSchema,
  NOTIFICATION: notificationConfigSchema,
  DATABASE: databaseConfigSchema,
  FUNCTION: functionConfigSchema,
  CUSTOM_API: customApiConfigSchema,
} as const;
