import Link from "next/link";
import { Package } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { prisma } from "@/lib/prisma";
import { formatRelativeTime } from "@/lib/utils";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "accent"> = {
  ACTIVE: "default",
  UNINSTALLED: "secondary",
  FAILED: "outline",
  ROLLED_BACK: "outline",
};

export default async function InstalledListingsPage() {
  const { membership } = await requireActiveMembership("/dashboard/marketplace/installed");

  const installs = await prisma.marketplaceInstall.findMany({
    where: { organizationId: membership.organizationId },
    include: { listing: { select: { name: true, slug: true, category: true, icon: true } }, version: { select: { version: true } } },
    orderBy: { installedAt: "desc" },
  });

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Installed</h1>
          <p className="text-sm text-muted-foreground">Every marketplace listing your organization has installed — real entitlement records, tracked by real version.</p>
        </div>

        {installs.length === 0 ? (
          <Card glass>
            <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
              <Package className="size-8 text-muted-foreground" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">Nothing installed yet.</p>
              <Link href="/dashboard/marketplace" className="text-sm text-primary hover:underline">
                Browse the Marketplace
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {installs.map((install) => (
              <Link key={install.id} href={install.listing.slug ? `/dashboard/marketplace/${install.listing.slug}` : "#"}>
                <Card glass className="transition-colors hover:border-primary/40">
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div>
                      <p className="font-medium text-foreground">{install.listing.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {install.listing.category.replace(/_/g, " ")} · v{install.version.version} · Installed {formatRelativeTime(install.installedAt)}
                      </p>
                    </div>
                    <Badge variant={STATUS_VARIANT[install.status]}>{install.status.replace(/_/g, " ")}</Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </Container>
    </main>
  );
}
