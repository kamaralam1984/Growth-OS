import { Container } from "@/components/ui/container";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "../../_lib/require-membership";
import { LicensesManager } from "./_components/licenses-manager";

const PRIVILEGED_ROLES = new Set(["OWNER", "ADMIN"]);

export default async function LicensesPage() {
  const { membership } = await requireActiveMembership("/dashboard/settings/licenses");

  const licenses = await prisma.license.findMany({
    where: { organizationId: membership.organizationId },
    orderBy: { issuedAt: "desc" },
  });

  const rows = licenses.map((license) => ({
    id: license.id,
    type: license.type,
    key: license.key,
    status: license.status,
    seats: license.seats,
    issuedAt: license.issuedAt.toISOString(),
    expiresAt: license.expiresAt ? license.expiresAt.toISOString() : null,
    activatedAt: license.activatedAt ? license.activatedAt.toISOString() : null,
    lastVerifiedAt: license.lastVerifiedAt ? license.lastVerifiedAt.toISOString() : null,
  }));

  return (
    <Container className="py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">License Management</h1>
        <p className="text-sm text-muted-foreground">
          Real API, seat, and enterprise license keys your organization issues to itself for external
          integrations and on-prem deployments. An external consumer calls the license-verification check
          (src/lib/billing/licenses.ts&apos;s <code className="font-mono">verifyLicense</code>) before granting
          access.
        </p>
      </div>

      <LicensesManager licenses={rows} canManage={PRIVILEGED_ROLES.has(membership.role)} />
    </Container>
  );
}
