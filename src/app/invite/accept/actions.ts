"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

const tokenSchema = z.string().trim().min(1, "A valid invitation token is required.");

/**
 * Accepts a pending invitation for the current signed-in user: validates the
 * token isn't expired/already-used, creates an ACTIVE Membership with the
 * invited role, marks the Invitation ACCEPTED, and redirects to "/".
 */
export async function acceptInvitation(token: string): Promise<void> {
  const parsedToken = tokenSchema.parse(token);

  const session = await auth();
  const userId = session?.user?.id;
  const userEmail = session?.user?.email;
  if (!userId) {
    throw new Error("You must be signed in to accept an invitation.");
  }

  const invitation = await prisma.invitation.findUnique({ where: { token: parsedToken } });
  if (!invitation) {
    throw new Error("This invitation link is invalid.");
  }
  if (invitation.status === "ACCEPTED") {
    throw new Error("This invitation has already been accepted.");
  }
  if (invitation.status === "REVOKED") {
    throw new Error("This invitation has been revoked.");
  }
  if (invitation.status === "EXPIRED" || invitation.expiresAt < new Date()) {
    if (invitation.status !== "EXPIRED") {
      await prisma.invitation.update({ where: { id: invitation.id }, data: { status: "EXPIRED" } });
    }
    throw new Error("This invitation has expired. Ask an admin to send a new one.");
  }
  if (userEmail && invitation.email.toLowerCase() !== userEmail.toLowerCase()) {
    throw new Error(
      `This invitation was sent to ${invitation.email}. Sign in with that email address to accept it.`,
    );
  }

  await prisma.$transaction([
    prisma.membership.upsert({
      where: { userId_organizationId: { userId, organizationId: invitation.organizationId } },
      create: {
        userId,
        organizationId: invitation.organizationId,
        role: invitation.role,
        status: "ACTIVE",
        invitedAt: invitation.createdAt,
      },
      update: {
        role: invitation.role,
        status: "ACTIVE",
      },
    }),
    prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: "ACCEPTED" },
    }),
  ]);

  await logAudit({
    userId,
    organizationId: invitation.organizationId,
    action: "invitation.accepted",
    metadata: { invitationId: invitation.id, role: invitation.role },
  });

  redirect("/");
}
