import { z } from "zod";

export const bugSeveritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type BugSeverityInput = z.infer<typeof bugSeveritySchema>;

export const bugStatusSchema = z.enum(["OPEN", "IN_PROGRESS", "FIXED", "VERIFIED", "WONT_FIX"]);
export type BugStatusInput = z.infer<typeof bugStatusSchema>;

export const createBugReportSchema = z.object({
  title: z.string().trim().min(1, "Give the bug a title."),
  description: z.string().trim().min(1, "Describe the bug."),
  severity: bugSeveritySchema.default("MEDIUM"),
  reproSteps: z.string().trim().max(4000).optional().or(z.literal("")),
  environment: z.string().trim().max(500).optional().or(z.literal("")),
});
export type CreateBugReportInput = z.input<typeof createBugReportSchema>;
