import { z } from "zod";

export const expenseCategorySchema = z.enum(["MARKETING", "SALES", "OTHER"]);

export const expenseEntrySchema = z.object({
  category: expenseCategorySchema,
  amount: z.coerce.number().positive("Enter an amount greater than 0."),
  incurredOn: z.coerce.date({ message: "Enter a valid date." }),
  description: z.string().trim().max(2000).optional(),
});
export type ExpenseEntryInput = z.infer<typeof expenseEntrySchema>;
