import Link from "next/link";
import { Building2 } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "../../_lib/require-membership";
import { LeadBoard } from "../_components/lead-board";
import { ClientForm } from "../_components/client-form";
import { ClientList } from "../_components/client-list";

export default async function CrmPipelinePage() {
  const { membership } = await requireActiveMembership("/dashboard/crm/pipeline");
  const organizationId = membership.organizationId;

  const [stages, clients, companies] = await Promise.all([
    prisma.pipelineStage.findMany({
      where: { workspace: { organizationId } },
      orderBy: { order: "asc" },
      include: {
        leads: {
          orderBy: { createdAt: "desc" },
          include: { companyRecord: { select: { leadScore: true } } },
        },
      },
    }),
    prisma.client.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      include: { company: { select: { name: true } } },
    }),
    prisma.company.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Pipeline</h1>
            <p className="text-sm text-muted-foreground">
              Lead Finder&rsquo;s top-of-funnel pipeline and your client base — drag leads between stages, manage
              clients, or convert a qualified lead into a Deal on the{" "}
              <Link href="/dashboard/crm/deals" className="text-primary hover:underline">
                Deals
              </Link>{" "}
              board.
            </p>
          </div>
          <Link
            href="/dashboard/companies"
            className="flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <Building2 className="size-4" /> View Companies
          </Link>
        </div>

        <Tabs defaultValue="pipeline">
          <TabsList>
            <TabsTrigger value="pipeline">Pipeline ({stages.reduce((n, s) => n + s.leads.length, 0)})</TabsTrigger>
            <TabsTrigger value="clients">Clients ({clients.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="pipeline">
            <LeadBoard
              currency={membership.organization.currency}
              stages={stages.map((stage) => ({
                id: stage.id,
                name: stage.name,
                leads: stage.leads.map((lead) => ({
                  id: lead.id,
                  name: lead.name,
                  company: lead.company,
                  estimatedValue: lead.estimatedValue,
                  leadScore: lead.companyRecord?.leadScore
                    ? { band: lead.companyRecord.leadScore.band, overallScore: lead.companyRecord.leadScore.overallScore }
                    : null,
                })),
              }))}
            />
          </TabsContent>

          <TabsContent value="clients" className="flex flex-col gap-4">
            <ClientForm companies={companies} />
            <ClientList
              currency={membership.organization.currency}
              clients={clients.map((c) => ({
                id: c.id,
                name: c.name,
                companyName: c.company?.name ?? null,
                email: c.email,
                status: c.status,
                contractValue: c.contractValue,
              }))}
            />
          </TabsContent>
        </Tabs>
      </Container>
    </main>
  );
}
