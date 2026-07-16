import { z } from "zod";

export const automationTriggerSchema = z.enum([
  "LEAD_CREATED",
  "TASK_COMPLETED",
  "MEETING_ENDED",
  "DECISION_MADE",
]);
export type AutomationTriggerInput = z.infer<typeof automationTriggerSchema>;

export const automationActionSchema = z.enum(["CREATE_TASK", "SEND_NOTIFICATION", "ASSIGN_AGENT"]);
export type AutomationActionInput = z.infer<typeof automationActionSchema>;

export const automationRuleSchema = z.object({
  name: z.string().trim().min(1, "Give the rule a name."),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  trigger: automationTriggerSchema,
  action: automationActionSchema,
  // Shape depends on `action`: CREATE_TASK -> { title, description? },
  // SEND_NOTIFICATION -> { title, message }, ASSIGN_AGENT -> { agentType, title }.
  actionConfig: z.record(z.string(), z.string()).refine((cfg) => Object.keys(cfg).length > 0, {
    message: "Fill in the action details.",
  }),
});

export type AutomationRuleInput = z.infer<typeof automationRuleSchema>;
