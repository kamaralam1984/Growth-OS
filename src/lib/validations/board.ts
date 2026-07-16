import { z } from "zod";

// ============================= Meetings =============================

export const createMeetingSchema = z.object({
  title: z.string().trim().min(1, "Give the meeting a title."),
  agenda: z.string().trim().min(1, "An agenda is required."),
});

export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;

// ============================= Tasks =============================

export const messagePrioritySchema = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);

export const createTaskSchema = z
  .object({
    title: z.string().trim().min(1, "Give the task a title."),
    description: z.string().trim().optional(),
    assignedToAgentId: z.string().trim().min(1).optional(),
    assignedToUserId: z.string().trim().min(1).optional(),
    dueDate: z.coerce.date().optional(),
    projectId: z.string().trim().min(1).optional(),
    meetingId: z.string().trim().min(1).optional(),
    companyId: z.string().trim().min(1).optional(),
    contactId: z.string().trim().min(1).optional(),
    priority: messagePrioritySchema.default("NORMAL"),
  })
  .refine((data) => Boolean(data.assignedToAgentId) !== Boolean(data.assignedToUserId), {
    message: "Assign the task to exactly one agent or one user.",
    path: ["assignedToAgentId"],
  });

// z.input (not z.infer/z.output): `priority` has a default, so it must stay
// optional for callers constructing this object — the schema itself fills
// the default during safeParse inside the action.
export type CreateTaskInput = z.input<typeof createTaskSchema>;

// ============================= Decisions =============================

export const decisionCategorySchema = z.enum([
  "PROPOSAL_APPROVAL",
  "CLIENT_CONTACT",
  "QUOTE_GENERATION",
  "MEETING_SCHEDULING",
  "ISSUE_ESCALATION",
  "GENERAL",
  "QUOTATION_APPROVAL",
  "CONTRACT_APPROVAL",
  "INVOICE_APPROVAL",
  "PROJECT_DELIVERY",
]);

export const createDecisionSchema = z.object({
  topic: z.string().trim().min(1, "A decision topic is required."),
  description: z.string().trim().optional(),
  category: decisionCategorySchema.default("GENERAL"),
});

// z.input, same reasoning as CreateTaskInput above — `category` has a default.
export type CreateDecisionInput = z.input<typeof createDecisionSchema>;

// ============================= Agent-to-agent messages =============================

export const sendAgentMessageSchema = z.object({
  // null/omitted receiverAgentId means broadcast to the whole board.
  receiverAgentId: z.string().trim().min(1).optional().nullable(),
  reason: z.string().trim().min(1, "A reason for this message is required."),
  priority: messagePrioritySchema.default("NORMAL"),
  content: z.string().trim().min(1, "Message content is required."),
  parentId: z.string().trim().min(1).optional(),
});

export type SendAgentMessageInput = z.infer<typeof sendAgentMessageSchema>;

// ============================= Agent goals =============================

export const createAgentGoalSchema = z.object({
  agentId: z.string().trim().min(1, "An agent is required."),
  goal: z.string().trim().min(1, "A goal is required."),
});

export type CreateAgentGoalInput = z.infer<typeof createAgentGoalSchema>;
