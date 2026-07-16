import { z } from "zod";

// Mirrors prisma.MembershipRole minus AI_AGENT — humans can't be invited as
// an AI_AGENT role, that membership kind is reserved for AIAgentInstance-linked
// system rows.
export const invitableRoleSchema = z.enum([
  "OWNER",
  "ADMIN",
  "MANAGER",
  "SALES",
  "MARKETING",
  "DEVELOPER",
  "SUPPORT",
  "FINANCE",
  "HR",
  "VIEWER",
]);

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  role: invitableRoleSchema,
});

export type InviteInput = z.infer<typeof inviteSchema>;
