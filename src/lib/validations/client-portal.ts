import { z } from "zod";

export const clientMagicLinkRequestSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
});
export type ClientMagicLinkRequestInput = z.infer<typeof clientMagicLinkRequestSchema>;

export const clientPasswordLoginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
  rememberMe: z.boolean().default(false),
});
export type ClientPasswordLoginInput = z.input<typeof clientPasswordLoginSchema>;

export const clientSetPasswordSchema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, { message: "Passwords don't match.", path: ["confirmPassword"] });
export type ClientSetPasswordInput = z.infer<typeof clientSetPasswordSchema>;
