"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { logAudit } from "@/lib/audit";
import { expenseEntrySchema, type ExpenseEntryInput } from "@/lib/validations/expenses";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function resolveExpenseInOrg(userId: string, expenseId: string) {
  const membership = await resolveActiveMembership(userId);
  if (!membership) return null;
  const expense = await prisma.expenseEntry.findUnique({ where: { id: expenseId } });
  if (!expense || expense.organizationId !== membership.organizationId) return null;
  return { membership, expense };
}

export interface CreateExpenseResult extends ActionResult {
  expenseId?: string;
}

export async function createExpenseEntry(input: ExpenseEntryInput): Promise<CreateExpenseResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = expenseEntrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the expense details." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  const organizationId = membership.organizationId;

  try {
    const expense = await prisma.expenseEntry.create({
      data: {
        organizationId,
        category: parsed.data.category,
        amount: parsed.data.amount,
        incurredOn: parsed.data.incurredOn,
        description: parsed.data.description || undefined,
        createdByUserId: userId,
      },
    });

    await logAudit({ userId, organizationId, action: "expense_entry.created", metadata: { expenseId: expense.id } });
    revalidatePath("/dashboard/billing/expenses");
    return { ok: true, expenseId: expense.id };
  } catch (error) {
    console.error("[expenses] createExpenseEntry failed:", error);
    return { ok: false, error: "Something went wrong logging the expense. Please try again." };
  }
}

export async function deleteExpenseEntry(expenseId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveExpenseInOrg(userId, expenseId);
  if (!resolved) return { ok: false, error: "Expense not found." };

  await prisma.expenseEntry.delete({ where: { id: expenseId } });
  await logAudit({ userId, organizationId: resolved.membership.organizationId, action: "expense_entry.deleted", metadata: { expenseId } });
  revalidatePath("/dashboard/billing/expenses");
  return { ok: true };
}
