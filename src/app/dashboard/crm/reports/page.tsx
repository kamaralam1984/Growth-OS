import { FileDown, Kanban, TrendingUp, DollarSign, ListChecks, Activity as ActivityIcon, Users2 } from "lucide-react";
import type { ComponentType } from "react";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "../../_lib/require-membership";

const REPORTS: Array<{ type: string; title: string; description: string; icon: ComponentType<{ className?: string }> }> = [
  { type: "pipeline", title: "Pipeline Report", description: "Every open deal, its stage, value, probability, and owner.", icon: Kanban },
  { type: "sales", title: "Sales Report", description: "Every decided deal (Won or Lost) with its outcome and owner.", icon: TrendingUp },
  { type: "revenue", title: "Revenue Report", description: "Every Won deal's value, company, and approximate close date.", icon: DollarSign },
  { type: "task", title: "Task Report", description: "Every task, its status, priority, due date, and assignee.", icon: ListChecks },
  { type: "activity", title: "Activity Report", description: "The most recent 500 CRM activity events across the organization.", icon: ActivityIcon },
  { type: "performance", title: "Performance Report", description: "Per-member workload — open deals, open deal value, and open tasks.", icon: Users2 },
];

async function getReportCount(type: string, organizationId: string): Promise<number> {
  switch (type) {
    case "pipeline":
      return prisma.deal.count({ where: { organizationId, dealStage: { name: { notIn: ["Won", "Lost", "Archived"] } } } });
    case "sales":
      return prisma.deal.count({ where: { organizationId, dealStage: { name: { in: ["Won", "Lost"] } } } });
    case "revenue":
      return prisma.deal.count({ where: { organizationId, dealStage: { name: "Won" } } });
    case "task":
      return prisma.task.count({ where: { organizationId } });
    case "activity":
      return prisma.activity.count({ where: { organizationId } });
    case "performance":
      return prisma.membership.count({ where: { organizationId, status: "ACTIVE" } });
    default:
      return 0;
  }
}

export default async function CrmReportsPage() {
  const { membership } = await requireActiveMembership("/dashboard/crm/reports");
  const organizationId = membership.organizationId;

  const counts = await Promise.all(REPORTS.map((r) => getReportCount(r.type, organizationId)));

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Every report is generated live from real org data and can be exported as CSV, Excel, or PDF.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {REPORTS.map((report, i) => {
            const Icon = report.icon;
            return (
              <Card key={report.type} glass>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="size-4" /> {report.title}
                  </CardTitle>
                  <CardDescription>{report.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <p className="text-2xl font-semibold tracking-tight text-foreground">{counts[i]}</p>
                  <div className="flex flex-wrap gap-3 text-sm">
                    {(["csv", "excel", "pdf"] as const).map((format) => (
                      <a
                        key={format}
                        href={`/api/export/crm-report/${report.type}?format=${format}`}
                        className="flex items-center gap-1 text-primary hover:underline"
                      >
                        <FileDown className="size-3.5" /> {format.toUpperCase()}
                      </a>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </Container>
    </main>
  );
}
