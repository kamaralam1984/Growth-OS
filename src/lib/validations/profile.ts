import { z } from "zod";

import { passwordSchema } from "@/lib/validations/auth";

// Mirrors the editable subset of User — email is intentionally excluded,
// changing email is out of scope for this phase (shown read-only in the UI).
export const personalInfoSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required."),
  lastName: z.string().trim().min(1, "Last name is required."),
  phone: z.string().trim().optional(),
  country: z.string().trim().optional(),
  language: z.string().trim().optional(),
  timezone: z.string().trim().optional(),
  jobTitle: z.string().trim().optional(),
  image: z.string().trim().url("Enter a valid photo URL.").optional().or(z.literal("")),
});

export type PersonalInfoInput = z.infer<typeof personalInfoSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().optional(),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, "Please confirm your new password."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const twoFactorConfirmSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app."),
});

export type TwoFactorConfirmInput = z.infer<typeof twoFactorConfirmSchema>;

export const notificationPreferencesSchema = z.object({
  emailNotifications: z.boolean(),
  browserNotifications: z.boolean(),
  slackNotifications: z.boolean(),
  teamsNotifications: z.boolean(),
  slackWebhookUrl: z.string().trim().url("Enter a valid webhook URL.").optional().or(z.literal("")),
  teamsWebhookUrl: z.string().trim().url("Enter a valid webhook URL.").optional().or(z.literal("")),
});

export type NotificationPreferencesInput = z.infer<typeof notificationPreferencesSchema>;

export const userPreferencesSchema = z.object({
  theme: z.enum(["light", "dark", "system"]),
  locale: z.string().trim().min(1),
});

export type UserPreferencesInput = z.infer<typeof userPreferencesSchema>;

export const toggleAgentActiveSchema = z.object({
  agentId: z.string().trim().min(1),
  active: z.boolean(),
});

export type ToggleAgentActiveInput = z.infer<typeof toggleAgentActiveSchema>;
