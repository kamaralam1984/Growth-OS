import { z } from "zod";

const optionalMoney = z.coerce.number().nonnegative("Value can't be negative.").optional();

export const dealPrioritySchema = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);
export type DealPriorityInput = z.infer<typeof dealPrioritySchema>;

export const dealSchema = z.object({
  name: z.string().trim().min(1, "Give the deal a name."),
  companyId: z.string().trim().optional().or(z.literal("")),
  contactId: z.string().trim().optional().or(z.literal("")),
  value: optionalMoney,
  probability: z.coerce.number().int().min(0, "Probability can't be negative.").max(100, "Probability can't exceed 100.").optional(),
  expectedCloseDate: z.coerce.date().optional(),
  ownerUserId: z.string().trim().optional().or(z.literal("")),
  priority: dealPrioritySchema.default("NORMAL"),
  products: z.array(z.string().trim().min(1)).max(30).default([]),
  services: z.array(z.string().trim().min(1)).max(30).default([]),
  notes: z.string().trim().max(4000).optional().or(z.literal("")),
});

export type DealInput = z.input<typeof dealSchema>;

export const taskTypeSchema = z.enum([
  "CALL",
  "EMAIL",
  "MEETING",
  "PROPOSAL",
  "RESEARCH",
  "FOLLOW_UP",
  "DOCUMENTATION",
  "APPROVAL",
  "DEVELOPMENT",
  "SUPPORT",
]);
export type TaskTypeInput = z.infer<typeof taskTypeSchema>;

export const taskPrioritySchema = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);

export const crmTaskSchema = z.object({
  title: z.string().trim().min(1, "Give the task a title."),
  description: z.string().trim().max(4000).optional().or(z.literal("")),
  type: taskTypeSchema.optional(),
  priority: taskPrioritySchema.default("NORMAL"),
  dueDate: z.coerce.date().optional(),
  dealId: z.string().trim().optional().or(z.literal("")),
  companyId: z.string().trim().optional().or(z.literal("")),
  contactId: z.string().trim().optional().or(z.literal("")),
  parentTaskId: z.string().trim().optional().or(z.literal("")),
  assignedToUserId: z.string().trim().optional().or(z.literal("")),
  labels: z.array(z.string().trim().min(1)).max(20).default([]),
  isRecurring: z.coerce.boolean().default(false),
  recurrenceRule: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]).optional(),
  dependsOnTaskIds: z.array(z.string().trim().min(1)).max(20).default([]),
});

export type CrmTaskInput = z.input<typeof crmTaskSchema>;

export const checklistItemSchema = z.object({
  label: z.string().trim().min(1, "Give the checklist item a label."),
});

export const reminderSchema = z.object({
  title: z.string().trim().min(1, "Give the reminder a title."),
  remindAt: z.coerce.date(),
  relatedDealId: z.string().trim().optional().or(z.literal("")),
  relatedTaskId: z.string().trim().optional().or(z.literal("")),
  relatedContactId: z.string().trim().optional().or(z.literal("")),
  relatedCompanyId: z.string().trim().optional().or(z.literal("")),
});

export type ReminderInput = z.input<typeof reminderSchema>;
