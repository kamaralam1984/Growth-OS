"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { reminderSchema, type ReminderInput } from "@/lib/validations/crm";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function resolveActiveMembership(userId: string) {
  return prisma.membership.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
}

export interface CreateReminderResult extends ActionResult {
  reminderId?: string;
}

export async function createReminder(input: ReminderInput): Promise<CreateReminderResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = reminderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the reminder details." };
  }

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  try {
    const reminder = await prisma.reminder.create({
      data: {
        organizationId: membership.organizationId,
        userId,
        title: parsed.data.title,
        remindAt: parsed.data.remindAt,
        relatedDealId: parsed.data.relatedDealId || null,
        relatedTaskId: parsed.data.relatedTaskId || null,
        relatedContactId: parsed.data.relatedContactId || null,
        relatedCompanyId: parsed.data.relatedCompanyId || null,
      },
    });

    revalidatePath("/dashboard/crm/calendar");
    revalidatePath("/dashboard/crm");
    return { ok: true, reminderId: reminder.id };
  } catch (error) {
    console.error("[crm] createReminder failed:", error);
    return { ok: false, error: "Something went wrong creating the reminder. Please try again." };
  }
}

export async function dismissReminder(reminderId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const reminder = await prisma.reminder.findUnique({ where: { id: reminderId } });
  if (!reminder || reminder.userId !== userId) return { ok: false, error: "Reminder not found." };

  await prisma.reminder.update({ where: { id: reminderId }, data: { dismissed: true } });
  revalidatePath("/dashboard/crm/calendar");
  return { ok: true };
}

export async function deleteReminder(reminderId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const reminder = await prisma.reminder.findUnique({ where: { id: reminderId } });
  if (!reminder || reminder.userId !== userId) return { ok: false, error: "Reminder not found." };

  await prisma.reminder.delete({ where: { id: reminderId } });
  revalidatePath("/dashboard/crm/calendar");
  return { ok: true };
}
