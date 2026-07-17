import { Container } from "@/components/ui/container";
import { requireActiveMembership } from "../_lib/require-membership";
import { prisma } from "@/lib/prisma";
import { getOrCreateDiscoveryConfig } from "@/lib/business-development/discovery-config";
import { DiscoverySettingsForm } from "./_components/discovery-settings-form";
import { DiscoveredLeadsList } from "./_components/discovered-leads-list";
import { OpportunitiesList } from "./_components/opportunities-list";
import { BuyerPersonasList } from "./_components/buyer-personas-list";

/**
 * Autonomous AI Business Development System (Phase 17) — one control panel:
 * discovery settings, recently auto-discovered leads, AI-detected
 * opportunities, and buyer personas. Everything here is opt-in
 * (`discoveryEnabled` defaults false) and every AI-generated item is either
 * grounded in real data with a confidence score, or explicitly marked
 * unknown — same discipline as the Company DNA review page.
 */
export default async function GrowthEnginePage() {
  const { membership } = await requireActiveMembership("/dashboard/growth-engine");
  const organizationId = membership.organizationId;
  const canManage = membership.role === "OWNER" || membership.role === "ADMIN";

  const config = await getOrCreateDiscoveryConfig(organizationId);

  const [discoveredCompanies, opportunities, personas] = await Promise.all([
    prisma.company.findMany({
      where: { organizationId, source: "AUTO_DISCOVERY" },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { leadScore: true },
    }),
    prisma.leadOpportunity.findMany({
      where: { company: { organizationId } },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { company: { select: { id: true, name: true } } },
    }),
    prisma.buyerPersona.findMany({
      where: { company: { organizationId } },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { company: { select: { id: true, name: true } } },
    }),
  ]);

  return (
    <Container className="flex flex-col gap-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Growth Engine</h1>
        <p className="text-sm text-muted-foreground">
          Continuous AI lead discovery, company research, opportunity detection, and buyer personas — reuses your
          existing Lead Finder, Company Intelligence, and Lead Scoring engines on a schedule. Off by default; nothing
          runs until you enable it below.
        </p>
      </div>

      <DiscoverySettingsForm
        config={{
          discoveryEnabled: config.discoveryEnabled,
          searchQueries: config.searchQueries,
          scoringWeights: (config.scoringWeights as Record<string, number> | null) ?? null,
          outreachAutoMode: config.outreachAutoMode,
        }}
        canManage={canManage}
        isOwner={membership.role === "OWNER"}
      />

      <DiscoveredLeadsList
        companies={discoveredCompanies.map((c) => ({
          id: c.id,
          name: c.name,
          website: c.website,
          industry: c.industry,
          createdAt: c.createdAt.toISOString(),
          scoreBand: c.leadScore?.band ?? null,
          overallScore: c.leadScore?.overallScore ?? null,
        }))}
        canManage={canManage}
      />

      <OpportunitiesList
        opportunities={opportunities.map((o) => ({
          id: o.id,
          companyId: o.company.id,
          companyName: o.company.name,
          category: o.category,
          title: o.title,
          description: o.description,
          estimatedImpact: o.estimatedImpact,
          estimatedValue: o.estimatedValue,
          evidence: o.evidence,
          confidenceScore: o.confidenceScore,
        }))}
      />

      <BuyerPersonasList
        personas={personas.map((p) => ({
          id: p.id,
          companyName: p.company.name,
          likelyTitle: p.likelyTitle,
          description: p.description,
          painPoints: p.painPoints,
          preferredChannel: p.preferredChannel,
          confidenceScore: p.confidenceScore,
          isVerified: p.isVerified,
        }))}
      />
    </Container>
  );
}
