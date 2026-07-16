import { z } from "zod";

export const startTimerSchema = z.object({
  taskId: z.string().trim().optional(),
  note: z.string().trim().max(500).optional(),
  billable: z.boolean().default(true),
});
export type StartTimerInput = z.input<typeof startTimerSchema>;

export const manualTimeEntrySchema = z
  .object({
    taskId: z.string().trim().optional(),
    startedAt: z.coerce.date(),
    endedAt: z.coerce.date(),
    billable: z.boolean().default(true),
    note: z.string().trim().max(500).optional(),
  })
  .refine((data) => data.endedAt > data.startedAt, { message: "End time must be after start time.", path: ["endedAt"] });
export type ManualTimeEntryInput = z.input<typeof manualTimeEntrySchema>;
