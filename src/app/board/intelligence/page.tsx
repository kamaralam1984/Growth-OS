import { redirect } from "next/navigation";
import { Users, TrendingUp, ExternalLink } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatRelativeTime } from "@/lib/utils";
import type { Competitor } from "@/lib/company-discovery/competitor-discovery";
import type { MarketTrend } from "@/lib/market-intelligence/trend-discovery";
import { listResearchBriefs, type ResearchFinding, type ResearchOpportunity } from "@/lib/ai/research-agent";
import { ResearchAgentPanel } from "./_components/research-agent-panel";

interface MarketOpportunity {
  title: string;
  description: string;
  relatedTrendTitle: string;
}

export default async function IntelligencePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=%2Fboard%2Fintelligence");
  }
  const userId = session.user.id;

  const membership = await prisma.membership.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  if (!membership) {
    redirect("/onboarding");
  }
  const organizationId = membership.organizationId;

  const [latestCompetitorSnapshot, latestTrendSnapshot, researchBriefs] = await Promise.all([
    prisma.competitorSnapshot.findFirst({ where: { organizationId }, orderBy: { createdAt: "desc" } }),
    // topic: null excludes Research Agent ad-hoc briefs — this tab shows only
    // the org's own scheduled monthly trend snapshot.
    prisma.marketTrendSnapshot.findFirst({ where: { organizationId, topic: null }, orderBy: { createdAt: "desc" } }),
    listResearchBriefs(organizationId),
  ]);

  const competitors = (latestCompetitorSnapshot?.competitors as unknown as Competitor[] | null) ?? [];
  const newlyDetected = new Set(latestCompetitorSnapshot?.newlyDetected ?? []);
  const trends = (latestTrendSnapshot?.trends as unknown as MarketTrend[] | null) ?? [];
  const opportunities = (latestTrendSnapshot?.opportunities as unknown as MarketOpportunity[] | null) ?? [];

  const researchBriefRows = researchBriefs.map((b) => ({
    id: b.id,
    topic: b.topic ?? "",
    findings: b.trends as unknown as ResearchFinding[],
    opportunities: (b.opportunities as unknown as ResearchOpportunity[] | null) ?? [],
    createdAt: b.createdAt.toISOString(),
  }));

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Intelligence</h1>
          <p className="text-sm text-muted-foreground">
            Competitor and market-trend signals, refreshed on a schedule via real AI web search. Everything here is
            clearly separated from verified, deterministic data elsewhere in the app — treat it as directional, not
            confirmed fact.
          </p>
        </div>

        <Tabs defaultValue="competitors">
          <TabsList>
            <TabsTrigger value="competitors">Competitors</TabsTrigger>
            <TabsTrigger value="trends">Market Trends</TabsTrigger>
            <TabsTrigger value="research">Research Agent</TabsTrigger>
          </TabsList>

          <TabsContent value="competitors">
            <Card glass>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  <Users className="size-4" /> Competitors <Badge variant="secondary">AI web search — not independently verified</Badge>
                </CardTitle>
                <CardDescription>
                  {latestCompetitorSnapshot
                    ? `Last refreshed ${formatRelativeTime(latestCompetitorSnapshot.createdAt)}.`
                    : "No refresh yet — runs weekly once a reviewed Company DNA exists (Settings → Company DNA)."}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {competitors.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No competitors found via web search yet.</p>
                ) : (
                  competitors.map((c) => (
                    <div key={c.name} className="rounded-lg border border-border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                          {c.name}
                          {newlyDetected.has(c.name) && <Badge variant="accent">New this refresh</Badge>}
                        </p>
                        {c.website && (
                          <a href={c.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">
                            {c.website} <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                      {c.positioning && <p className="mt-1 text-sm text-muted-foreground">{c.positioning}</p>}
                      {(c.strengths.length > 0 || c.weaknesses.length > 0) && (
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {c.strengths.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground">Strengths</p>
                              <ul className="list-inside list-disc text-xs text-muted-foreground">
                                {c.strengths.map((s, i) => (
                                  <li key={i}>{s}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {c.weaknesses.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground">Weaknesses</p>
                              <ul className="list-inside list-disc text-xs text-muted-foreground">
                                {c.weaknesses.map((w, i) => (
                                  <li key={i}>{w}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="trends">
            <Card glass>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  <TrendingUp className="size-4" /> Market Trends <Badge variant="secondary">AI web search — not independently verified</Badge>
                </CardTitle>
                <CardDescription>
                  {latestTrendSnapshot
                    ? `Last refreshed ${formatRelativeTime(latestTrendSnapshot.createdAt)}.`
                    : "No refresh yet — runs monthly once an AI provider is configured."}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {trends.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No trends found via web search yet.</p>
                ) : (
                  trends.map((t) => (
                    <div key={t.title} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-foreground">{t.title}</p>
                        <Badge variant="outline">{t.signalStrength}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {opportunities.length > 0 && (
              <Card glass className="mt-4">
                <CardHeader>
                  <CardTitle className="text-base">Related Opportunities</CardTitle>
                  <CardDescription>AI-flagged, grounded in the trends above — never independent fact.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {opportunities.map((o) => (
                    <div key={o.title} className="rounded-lg border border-border p-3">
                      <p className="text-sm font-medium text-foreground">{o.title}</p>
                      <p className="text-sm text-muted-foreground">{o.description}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Related trend: {o.relatedTrendTitle}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="research">
            <ResearchAgentPanel initialBriefs={researchBriefRows} />
          </TabsContent>
        </Tabs>
      </Container>
    </main>
  );
}
