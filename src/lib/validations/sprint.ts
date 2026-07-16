import { z } from "zod";

export const sprintSchema = z
  .object({
    name: z.string().trim().min(1, "Sprint name is required.").max(150),
    goal: z.string().trim().max(1000).optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    capacityHours: z.coerce.number().min(0).optional(),
  })
  .refine((data) => data.endDate > data.startDate, { message: "End date must be after start date.", path: ["endDate"] });
export type SprintInput = z.input<typeof sprintSchema>;
