"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Marks a single Notification as read. Ownership is checked by looking the
 * notification up and comparing userId to the session — never trusts a
 * client-supplied owner.
 */
export async function markNotificationRead(id: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  if (!id || typeof id !== "string") {
    return { ok: false, error: "Invalid notification." };
  }

  try {
    const notification = await prisma.notification.findUnique({ where: { id } });
    if (!notification || notification.userId !== userId) {
      return { ok: false, error: "Notification not found." };
    }

    if (!notification.read) {
      await prisma.notification.update({ where: { id }, data: { read: true } });
    }

    revalidatePath("/board", "layout");
    return { ok: true };
  } catch (error) {
    console.error("[board] markNotificationRead failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/**
 * Marks every unread Notification belonging to the signed-in user as read
 * (across all their organizations — a user only ever belongs to one in this
 * product today, but this stays correct either way).
 */
export async function markAllNotificationsRead(): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  try {
    await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });

    revalidatePath("/board", "layout");
    return { ok: true };
  } catch (error) {
    console.error("[board] markAllNotificationsRead failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
