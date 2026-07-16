import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import type { Membership, Organization } from "@/generated/prisma/client";

export const ACTIVE_ORG_COOKIE = "activeOrgId";

export type ActiveMembership = Membership & { organization: Organization };

/**
 * Shared auth + active-org resolution for every /dashboard/* page (mirrors
 * the auth()+membership check every /board/* page already does itself —
 * dashboard/layout.tsx only renders chrome and does not redirect on its
 * own, same pattern as board/layout.tsx). Redirects to /login if signed
 * out, /onboarding if the user has no ACTIVE membership yet.
 *
 * Honors the `activeOrgId` cookie set by the workspace switcher when it
 * refers to one of the user's own ACTIVE memberships; otherwise falls back
 * to the earliest-joined ACTIVE membership (same default as board/layout.tsx).
 */
export async function requireActiveMembership(callbackPath: string): Promise<{
  userId: string;
  membership: ActiveMembership;
}> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackPath)}`);
  }

  const memberships = await prisma.membership.findMany({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    include: { organization: true },
  });

  if (memberships.length === 0) {
    redirect("/onboarding");
  }

  const cookieStore = await cookies();
  const preferredOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const membership = memberships.find((m) => m.organizationId === preferredOrgId) ?? memberships[0];

  return { userId, membership };
}
