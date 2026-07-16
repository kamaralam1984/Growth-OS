import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Globe, Sparkles, AlertCircle, Clock, Download, DollarSign } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AiErrorBanner } from "@/app/board/_components/ai-error-banner";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/app/dashboard/_lib/format";
import { requireActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { OpportunityBandBadge } from "../_components/opportunity-band-badge";
import { ScoreGauge } from "../_components/score-gauge";
import { RadarChart } from "../_components/radar-chart";
import { OpportunityMatrix } from "../_components/opportunity-matrix";
import { FindingsChecklist, type Finding } from "../_components/findings-checklist";
import { TechnologyChipGrid } from "../_components/technology-chip-grid";
import { ScanCrmActions } from "../_components/scan-crm-actions";

export default async function ScanReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { membership } = await requireActiveMembership(`/dashboard/website-scanner/${id}`);

  const scan = await prisma.websiteScan.findUnique({
    where: { id },
    include: {
      technologies: true,
      seoAudit: true,
      performanceAudit: true,
      securityAudit: true,
      uxAudit: true,
      opportunity: true,
      recommendations: { orderBy: { createdAt: "asc" } },
      executiveReport: true,
      company: { include: { leads: { select: { id: true }, take: 1 } } },
    },
  });

  if (!scan || scan.organizationId !== membership.organizationId) {
    notFound();
  }

  const members = await prisma.membership.findMany({
    where: { organizationId: membership.organizationId, status: "ACTIVE" },
    select: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  const title = scan.websiteName || scan.companyNameInput || scan.finalUrl || scan.url;

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <Link href="/dashboard/website-scanner" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to Website Scanner
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
              <Globe className="size-6 text-primary" /> {title}
            </h1>
            <a href={scan.finalUrl ?? scan.url} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">
              {scan.finalUrl ?? scan.url}
            </a>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline">{scan.status}</Badge>
              {scan.opportunity && <OpportunityBandBadge band={scan.opportunity.band} score={scan.opportunity.overallOpportunityScore} />}
              {scan.scannedAt && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="size-3.5" /> Scanned {new Date(scan.scannedAt).toLocaleString()}
                </span>
              )}
            </div>
          </div>
          {scan.status === "COMPLETED" && (
            <div className="flex items-center gap-3">
              <a href={`/api/export/scans/${scan.id}?format=pdf`} className="flex items-center gap-1.5 text-sm text-primary hover:underline">
                <Download className="size-4" /> Download PDF
              </a>
              <a href={`/api/export/scans/${scan.id}?format=excel`} className="flex items-center gap-1.5 text-sm text-primary hover:underline">
                <Download className="size-4" /> Excel
              </a>
            </div>
          )}
        </div>

        {scan.status === "FAILED" && (
          <Card glass>
            <CardContent className="flex items-start gap-3 p-5">
              <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
              <div>
                <p className="text-sm font-medium text-foreground">This scan could not be completed.</p>
                <p className="text-sm text-muted-foreground">{scan.errorMessage ?? "An unknown error occurred."}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {(scan.status === "PENDING" || scan.status === "SCANNING") && (
          <Card glass>
            <CardContent className="p-5 text-sm text-muted-foreground">This scan is still running — refresh in a moment.</CardContent>
          </Card>
        )}

        {scan.status === "COMPLETED" && scan.opportunity && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="flex flex-col gap-4 lg:col-span-2">
              <Card glass>
                <CardContent className="flex flex-wrap items-center justify-around gap-6 p-6">
                  <ScoreGauge score={scan.opportunity.overallOpportunityScore} label="Overall Opportunity" size={180} />
                  {scan.seoAudit && <ScoreGauge score={scan.seoAudit.seoScore} label="SEO" size={140} />}
                  {scan.performanceAudit && <ScoreGauge score={scan.performanceAudit.performanceScore} label="Performance" size={140} />}
                  {scan.securityAudit && <ScoreGauge score={scan.securityAudit.securityScore} label="Security" size={140} />}
                  {scan.uxAudit && <ScoreGauge score={scan.uxAudit.uxScore} label="UX" size={140} />}
                </CardContent>
              </Card>

              <Card glass>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <DollarSign className="size-4" /> Estimated Investment Range
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-1 pt-0">
                  <p className="text-2xl font-semibold text-foreground">
                    {formatCurrency(scan.opportunity.estimatedValueMin ?? 0)} – {formatCurrency(scan.opportunity.estimatedValueMax ?? 0)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Estimated timeline: {scan.opportunity.estimatedTimeline} · Confidence: {scan.opportunity.confidenceLevel}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Indicative estimate only — not a quotation.</p>
                </CardContent>
              </Card>

              <Tabs defaultValue="overview">
                <TabsList className="flex-wrap">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="technology">Technology</TabsTrigger>
                  <TabsTrigger value="seo">SEO</TabsTrigger>
                  <TabsTrigger value="performance">Performance</TabsTrigger>
                  <TabsTrigger value="security">Security</TabsTrigger>
                  <TabsTrigger value="ux">UX</TabsTrigger>
                  <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
                  <TabsTrigger value="report">Executive Report</TabsTrigger>
                </TabsList>

                <TabsContent value="overview">
                  <Card glass>
                    <CardHeader>
                      <CardTitle className="text-base">Opportunity dimensions</CardTitle>
                    </CardHeader>
                    <CardContent className="flex justify-center pt-0">
                      <RadarChart
                        axes={[
                          { label: "SEO", value: scan.seoAudit?.seoScore ?? 0 },
                          { label: "Performance", value: scan.performanceAudit?.performanceScore ?? 0 },
                          { label: "Security", value: scan.securityAudit?.securityScore ?? 0 },
                          { label: "UX", value: scan.uxAudit?.uxScore ?? 0 },
                          { label: "AI Readiness", value: scan.opportunity.aiReadinessScore },
                        ]}
                      />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="technology">
                  <Card glass>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        Detected Technologies <Badge variant="outline">Verified</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <TechnologyChipGrid technologies={scan.technologies} />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="seo">
                  <Card glass>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        SEO Findings <Badge variant="outline">Verified</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <FindingsChecklist findings={(scan.seoAudit?.findings as Finding[] | undefined) ?? []} />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="performance">
                  <Card glass>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        Performance Findings <Badge variant="outline">Verified</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3 pt-0">
                      <p className="text-xs text-muted-foreground">Estimated from static response analysis — not a Lighthouse/Core Web Vitals measurement.</p>
                      <FindingsChecklist findings={(scan.performanceAudit?.findings as Finding[] | undefined) ?? []} />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="security">
                  <Card glass>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        Security Findings <Badge variant="outline">Verified</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3 pt-0">
                      <p className="text-xs text-muted-foreground">High-level automated assessment — not a penetration test.</p>
                      <FindingsChecklist findings={(scan.securityAudit?.findings as Finding[] | undefined) ?? []} />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="ux">
                  <Card glass>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        UX Findings <Badge variant="outline">Verified</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <FindingsChecklist findings={(scan.uxAudit?.findings as Finding[] | undefined) ?? []} />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="recommendations">
                  <div className="flex flex-col gap-4">
                    {!scan.executiveReport ? (
                      <AiErrorBanner error="The AI recommendation pass didn't complete for this scan — the verified findings above are still real and complete." kind="generic" />
                    ) : (
                      <>
                        <Card glass>
                          <CardHeader>
                            <CardTitle className="text-base">Impact vs. Effort</CardTitle>
                          </CardHeader>
                          <CardContent className="flex justify-center pt-0">
                            <OpportunityMatrix
                              items={scan.recommendations.map((r) => ({ id: r.id, title: r.title, category: r.category, priority: r.priority }))}
                            />
                          </CardContent>
                        </Card>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {scan.recommendations.map((rec) => (
                            <Card key={rec.id} glass>
                              <CardContent className="flex flex-col gap-1.5 p-4">
                                <div className="flex items-center justify-between gap-2">
                                  <Badge variant="accent">AI Recommendation</Badge>
                                  <Badge variant="outline">{rec.priority}</Badge>
                                </div>
                                <p className="text-sm font-medium text-foreground">{rec.title}</p>
                                <p className="text-xs text-muted-foreground">{rec.category.replace(/_/g, " ")}</p>
                                <p className="text-sm text-muted-foreground">{rec.rationale}</p>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="report">
                  {!scan.executiveReport ? (
                    <AiErrorBanner error="The AI Executive Report didn't complete for this scan — the verified findings in the other tabs are still real and complete." kind="generic" />
                  ) : (
                    <Card glass>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Sparkles className="size-4 text-primary" /> Executive Report <Badge variant="accent">AI-generated</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-4 pt-0">
                        <div>
                          <p className="text-xs font-semibold text-foreground">Executive summary</p>
                          <p className="mt-1 text-sm text-muted-foreground">{scan.executiveReport.executiveSummary}</p>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div>
                            <p className="text-xs font-semibold text-foreground">Strengths</p>
                            <ul className="mt-1 flex flex-col gap-1">
                              {scan.executiveReport.strengths.map((s, i) => (
                                <li key={i} className="text-sm text-muted-foreground before:mr-1.5 before:text-primary before:content-['•']">
                                  {s}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-foreground">Weaknesses</p>
                            <ul className="mt-1 flex flex-col gap-1">
                              {scan.executiveReport.weaknesses.map((s, i) => (
                                <li key={i} className="text-sm text-muted-foreground before:mr-1.5 before:text-primary before:content-['•']">
                                  {s}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-foreground">Business opportunities</p>
                          <ul className="mt-1 flex flex-col gap-1">
                            {scan.executiveReport.businessOpportunities.map((s, i) => (
                              <li key={i} className="text-sm text-muted-foreground before:mr-1.5 before:text-primary before:content-['•']">
                                {s}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div>
                            <p className="text-xs font-semibold text-foreground">Technology overview</p>
                            <p className="mt-1 text-sm text-muted-foreground">{scan.executiveReport.technologyOverview}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-foreground">SEO findings</p>
                            <p className="mt-1 text-sm text-muted-foreground">{scan.executiveReport.seoFindingsSummary}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-foreground">Performance findings</p>
                            <p className="mt-1 text-sm text-muted-foreground">{scan.executiveReport.performanceFindingsSummary}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-foreground">Security observations</p>
                            <p className="mt-1 text-sm text-muted-foreground">{scan.executiveReport.securityObservations}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-foreground">UX findings</p>
                            <p className="mt-1 text-sm text-muted-foreground">{scan.executiveReport.uxFindings}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-foreground">Business impact</p>
                            <p className="mt-1 text-sm text-muted-foreground">{scan.executiveReport.businessImpact}</p>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-foreground">Next steps</p>
                          <ul className="mt-1 flex flex-col gap-1">
                            {scan.executiveReport.nextSteps.map((s, i) => (
                              <li key={i} className="text-sm text-muted-foreground before:mr-1.5 before:text-primary before:content-['•']">
                                {s}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>
              </Tabs>
            </div>

            <div className="flex flex-col gap-4">
              <ScanCrmActions
                scanId={scan.id}
                hasLead={(scan.company?.leads.length ?? 0) > 0}
                ownerUserId={scan.company?.ownerUserId ?? null}
                priority={scan.company?.priority ?? "NORMAL"}
                hasExecutiveReport={Boolean(scan.executiveReport)}
                members={members.map((m) => m.user)}
              />
            </div>
          </div>
        )}
      </Container>
    </main>
  );
}
