import { prisma } from "@/lib/prisma";

/**
 * Shared outbound email helper — extracted from the exact pattern already
 * used by the magic-link provider in src/auth.ts. With no EMAIL_SERVER
 * configured (the default in this environment), never attempts a real send;
 * it logs to the server console and resolves successfully instead. Never
 * throws — a failed/unconfigured email must not break the action that
 * triggered it, same convention as logAudit/logActivity/notifyUser.
 */
export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  try {
    if (!process.env.EMAIL_SERVER) {
      console.log(`[DEV] Email to ${input.to}: ${input.subject}\n${input.text}`);
      return;
    }

    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport(process.env.EMAIL_SERVER);
    await transport.sendMail({
      to: input.to,
      from: process.env.EMAIL_FROM ?? "no-reply@kvlgrowthos.local",
      subject: input.subject,
      text: input.text,
      html: input.html ?? `<p>${input.text.replace(/\n/g, "<br/>")}</p>`,
    });
  } catch (error) {
    console.error("[email] failed to send:", error);
  }
}

/**
 * Sends one email per org owner/admin who has `UserPreference.emailNotifications`
 * enabled (default true) — the first real consumer of that existing, previously
 * unused schema field. Mirrors notifyOrganizationOwners' membership lookup.
 */
export async function emailOrganizationOwners(input: {
  organizationId: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  try {
    const memberships = await prisma.membership.findMany({
      where: { organizationId: input.organizationId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN"] } },
      select: { user: { select: { id: true, email: true, preference: { select: { emailNotifications: true } } } } },
    });

    const recipients = memberships
      .map((m) => m.user)
      .filter((u) => u.email && (u.preference?.emailNotifications ?? true));

    await Promise.all(
      recipients.map((u) => sendEmail({ to: u.email!, subject: input.subject, text: input.text, html: input.html })),
    );
  } catch (error) {
    console.error("[email] emailOrganizationOwners failed:", error);
  }
}
