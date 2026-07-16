import { z } from "zod";

// Cron-expression syntax validation is NOT duplicated here — it's done for
// real against cron-parser's own parser inside
// bullmqProvider.updateCronExpression (src/lib/scheduler/providers/bullmq-provider.ts),
// the same parser BullMQ itself uses to interpret the pattern. This schema
// only enforces the input shape reaching that call.
export const updateJobCronExpressionSchema = z.object({
  key: z.string().trim().min(1, "Missing job key."),
  cronExpression: z.string().trim().min(1, "Enter a cron expression.").max(200),
});
export type UpdateJobCronExpressionInput = z.infer<typeof updateJobCronExpressionSchema>;
