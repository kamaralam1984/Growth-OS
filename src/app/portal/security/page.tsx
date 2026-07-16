import { Container } from "@/components/ui/container";
import { prisma } from "@/lib/prisma";
import { requireClientPortalSession, getCurrentSessionId } from "@/lib/client-portal/auth";
import { SecurityClient } from "./_components/security-client";

export default async function PortalSecurityPage() {
  const session = await requireClientPortalSession("/portal/security");
  const currentSessionId = await getCurrentSessionId();

  const [devices, sessions] = await Promise.all([
    prisma.clientDevice.findMany({ where: { clientPortalUserId: session.clientPortalUser.id }, orderBy: { lastSeenAt: "desc" } }),
    prisma.clientSession.findMany({
      where: { clientPortalUserId: session.clientPortalUser.id, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { device: { select: { label: true } } },
      orderBy: { lastActiveAt: "desc" },
    }),
  ]);

  return (
    <main className="py-10">
      <Container className="flex max-w-2xl flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Security settings</h1>
          <p className="text-sm text-muted-foreground">Manage your password, devices, and active sessions.</p>
        </div>
        <SecurityClient
          hasPassword={Boolean(session.clientPortalUser.passwordHash)}
          devices={devices.map((d) => ({ id: d.id, label: d.label, trusted: d.trusted, lastSeenAt: d.lastSeenAt.toISOString() }))}
          sessions={sessions.map((s) => ({
            id: s.id,
            deviceLabel: s.device?.label ?? null,
            ipAddress: s.ipAddress,
            rememberMe: s.rememberMe,
            lastActiveAt: s.lastActiveAt.toISOString(),
            isCurrent: s.id === currentSessionId,
          }))}
        />
      </Container>
    </main>
  );
}
