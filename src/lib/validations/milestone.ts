import { z } from "zod";

export const milestoneStatusSchema = z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "DELAYED"]);
export type MilestoneStatusInput = z.infer<typeof milestoneStatusSchema>;

export const milestoneSchema = z.object({
  name: z.string().trim().min(1, "Give the milestone a name."),
  description: z.string().trim().max(4000).optional().or(z.literal("")),
  dueDate: z.coerce.date().optional(),
  status: milestoneStatusSchema.default("PENDING"),
  visibleToClient: z.boolean().default(true),
});
export type MilestoneInput = z.input<typeof milestoneSchema>;
