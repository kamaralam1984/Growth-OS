import { z } from "zod";

const SECRET_CATEGORIES = [
  "API_KEY",
  "OAUTH_SECRET",
  "JWT_SECRET",
  "SMTP_CREDENTIAL",
  "DATABASE_CREDENTIAL",
  "ENCRYPTION_KEY",
  "OTHER",
] as const;

export const createOrRotateSecretSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, "Key is required.")
    .max(100, "Key must be 100 characters or fewer.")
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/, "Key must be a slug: letters, numbers, dots, dashes, or underscores only."),
  value: z.string().min(1, "Value is required."),
  category: z.enum(SECRET_CATEGORIES),
  description: z.string().trim().max(500, "Description must be 500 characters or fewer.").optional(),
});

export type CreateOrRotateSecretInput = z.infer<typeof createOrRotateSecretSchema>;
