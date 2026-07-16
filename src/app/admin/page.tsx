import Link from "next/link";
import {
  Workflow,
  Wrench,
  Server,
  AlertTriangle,
  ShieldCheck,
  CreditCard,
  Landmark,
  Percent,
} from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { requirePlatformOwner } from "@/lib/billing/platform-admin";

const SECTIONS = [
  { href: "/admin/workflow", label: "Workflow", description: "Visual map of how the whole platform works.", icon: Workflow },
  { href: "/admin/automation", label: "Automation Builder", description: "Build and run platform-level automations.", icon: Wrench },
  { href: "/admin/production", label: "Production", description: "Health checks, deployments, backups.", icon: Server },
  { href: "/admin/incidents", label: "Incidents", description: "Declared and auto-opened incidents.", icon: AlertTriangle },
  { href: "/admin/compliance", label: "Compliance", description: "Compliance reports and posture.", icon: ShieldCheck },
  { href: "/admin/billing", label: "Billing", description: "Platform-wide revenue and billing.", icon: CreditCard },
  { href: "/admin/payouts", label: "Payouts", description: "Partner/reseller payout tracking.", icon: Landmark },
  { href: "/admin/partners", label: "Partners", description: "Partner account status.", icon: Percent },
] as const;

export default async function AdminOverviewPage() {
  await requirePlatformOwner("/admin");

  return (
    <Container className="flex flex-col gap-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Platform Admin</h1>
        <p className="text-sm text-muted-foreground">Cross-tenant, platform-level tools — not scoped to any one organization.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <Link key={section.href} href={section.href}>
              <Card glass className="h-full transition-colors hover:border-primary/50">
                <CardHeader className="flex-row items-center gap-3 space-y-0">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
                    <Icon className="size-4" />
                  </span>
                  <CardTitle className="text-base">{section.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{section.description}</CardDescription>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </Container>
  );
}
