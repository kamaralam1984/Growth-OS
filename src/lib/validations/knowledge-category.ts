import { z } from "zod";

export const knowledgeCategorySchema = z.object({
  name: z.string().trim().min(1, "Give the category a name.").max(120),
  description: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null)),
  parentId: z
    .string()
    .trim()
    .min(1)
    .nullable()
    .optional()
    .transform((value) => value ?? null),
});

export type KnowledgeCategoryInput = z.infer<typeof knowledgeCategorySchema>;
