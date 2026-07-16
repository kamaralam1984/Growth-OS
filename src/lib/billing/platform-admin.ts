import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Platform-operator access guard — completely distinct from
 * requireActiveMembership (src/app/dashboard/_lib/require-membership.ts),
 * which is always scoped to ONE organization. This gates the cross-tenant
 * Admin Billing Dashboard (MRR/ARR/churn across every organization) to
 * User.isPlatformOwner only — a flag that is never settable through any
 * organization-scoped UI/action, only ever flipped directly in the
 * database by whoever operates this deployment.
 */
export async function requirePlatformOwner(redirectPath: string): Promise<{ userId: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect(`/login?callbackUrl=${encodeURIComponent(redirectPath)}`);

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isPlatformOwner: true } });
  if (!user?.isPlatformOwner) redirect("/dashboard");

  return { userId };
}

export async function isPlatformOwner(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isPlatformOwner: true } });
  return user?.isPlatformOwner ?? false;
}
