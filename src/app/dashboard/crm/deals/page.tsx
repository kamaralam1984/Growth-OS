import { Container } from "@/components/ui/container";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "../../_lib/require-membership";
import { DealBoard, type BoardDealStage } from "../_components/deal-board";
import { DealListTable, type DealListRow } from "../_components/deal-list-table";
import { DealForm } from "../_components/deal-form";

export default async function DealsPage() {
  const { membership } = await requireActiveMembership("/dashboard/crm/deals");
  const organizationId = membership.organizationId;

  const [stages, companies, contacts, members] = await Promise.all([
    prisma.dealStage.findMany({
      where: { workspace: { organizationId } },
      orderBy: { order: "asc" },
      include: {
        deals: {
          orderBy: { createdAt: "desc" },
          include: { owner: { select: { name: true } }, company: { select: { name: true } } },
        },
      },
    }),
    prisma.company.findMany({ where: { organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.contact.findMany({
      where: { organizationId },
      orderBy: { firstName: "asc" },
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.membership.findMany({
      where: { organizationId, status: "ACTIVE" },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
  ]);

  const boardStages: BoardDealStage[] = stages.map((stage) => ({
    id: stage.id,
    name: stage.name,
    deals: stage.deals.map((d) => ({
      id: d.id,
      name: d.name,
      value: d.value,
      probability: d.probability,
      priority: d.priority,
      ownerName: d.owner?.name ?? null,
      companyName: d.company?.name ?? null,
      products: d.products,
    })),
  }));

  const listRows: DealListRow[] = stages.flatMap((stage) =>
    stage.deals.map((d) => ({
      id: d.id,
      name: d.name,
      stageName: stage.name,
      value: d.value,
      probability: d.probability,
      priority: d.priority,
      ownerUserId: d.ownerUserId,
      ownerName: d.owner?.name ?? null,
      expectedCloseDate: d.expectedCloseDate ? d.expectedCloseDate.toISOString().slice(0, 10) : null,
    })),
  );

  const memberOptions = members.map((m) => ({ userId: m.user.id, name: m.user.name, email: m.user.email }));
  const contactOptions = contacts.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName ?? ""}`.trim() }));

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Deals</h1>
            <p className="text-sm text-muted-foreground">
              The enterprise sales pipeline — drag deals between stages, or open one for the full editor.
            </p>
          </div>
          <a href="/api/export/deals?format=csv" className="text-sm text-primary hover:underline">
            Export CSV
          </a>
        </div>

        <DealForm companies={companies} contacts={contactOptions} members={memberOptions} />

        <Tabs defaultValue="board">
          <TabsList>
            <TabsTrigger value="board">Board</TabsTrigger>
            <TabsTrigger value="list">List ({listRows.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="board">
            <DealBoard stages={boardStages} currency={membership.organization.currency} />
          </TabsContent>

          <TabsContent value="list">
            <DealListTable deals={listRows} owners={memberOptions} currency={membership.organization.currency} />
          </TabsContent>
        </Tabs>
      </Container>
    </main>
  );
}
