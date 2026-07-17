"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { toast } from "@/components/ui/toast";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import {
  approveCompanyDNAAction,
  rejectCompanyDNAAction,
  retryCompanyDiscoveryAction,
  updateBusinessUnderstandingAction,
} from "../actions";
import type { BusinessUnderstanding, ICP } from "@/lib/company-discovery/business-understanding";
import type { SWOT, BusinessOpportunities } from "@/lib/company-discovery/swot-opportunities";
import type { DraftConfiguration } from "@/lib/company-discovery/draft-configuration";
import type { BrandAssets } from "@/lib/company-discovery/brand-extractor";
import type { LinkedInInsights } from "@/lib/company-discovery/linkedin-research";
import type { WidgetType } from "@/generated/prisma/client";

type RunStatus = "PENDING" | "CRAWLING" | "ANALYZING" | "AWAITING_REVIEW" | "APPROVED" | "REJECTED" | "FAILED";

interface RunProp {
  id: string;
  status: RunStatus;
  currentStep: string | null;
  errorMessage: string | null;
}

interface CompetitorProp {
  id: string;
  name: string;
  website: string | null;
  strengths: string[];
  weaknesses: string[];
  positioning: string | null;
}

interface DnaProp {
  id: string;
  status: "AWAITING_REVIEW" | "APPROVED" | "REJECTED";
  crawledPages: unknown;
  brandAssets: unknown;
  businessUnderstanding: unknown;
  linkedinInsights: unknown;
  icp: unknown;
  swot: unknown;
  opportunities: unknown;
  unknownFields: string[];
  draftConfiguration: unknown;
  competitors: CompetitorProp[];
  executiveMeeting: { id: string; title: string; summary: string | null; notesJson: unknown; status: string } | null;
}

const IN_PROGRESS_STATUSES: RunStatus[] = ["PENDING", "CRAWLING", "ANALYZING"];

export function CompanyDnaReview({
  run,
  dna,
  hasWebsite,
  canManage,
}: {
  run: RunProp | null;
  dna: DnaProp | null;
  hasWebsite: boolean;
  canManage: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!run || !IN_PROGRESS_STATUSES.includes(run.status)) return;
    const interval = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(interval);
  }, [run, router]);

  if (!run) {
    return (
      <EmptyState
        hasWebsite={hasWebsite}
        canManage={canManage}
        title="No analysis yet"
        description={
          hasWebsite
            ? "Your organization has a website configured but no analysis has run yet."
            : "Add a website URL in your company profile, then start an analysis here."
        }
      />
    );
  }

  if (IN_PROGRESS_STATUSES.includes(run.status)) {
    return (
      <Card glass>
        <CardHeader>
          <CardTitle>Analyzing your company…</CardTitle>
          <CardDescription>{run.currentStep ?? "Starting…"}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This runs in the background — feel free to keep using the app. This page updates automatically.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (run.status === "FAILED") {
    return (
      <Card glass>
        <CardHeader>
          <CardTitle>Analysis failed</CardTitle>
          <CardDescription>{run.errorMessage ?? "Something went wrong."}</CardDescription>
        </CardHeader>
        <CardContent>
          {canManage ? <RetryButton label="Try again" /> : <p className="text-sm text-muted-foreground">Ask an owner or admin to retry.</p>}
        </CardContent>
      </Card>
    );
  }

  if (!dna) {
    return <EmptyState hasWebsite={hasWebsite} canManage={canManage} title="No profile yet" description="This run finished without producing a profile." />;
  }

  const businessUnderstanding = dna.businessUnderstanding as BusinessUnderstanding;
  const icp = dna.icp as ICP;
  const swot = dna.swot as SWOT;
  const opportunities = dna.opportunities as BusinessOpportunities;
  const brandAssets = dna.brandAssets as BrandAssets;
  const linkedinInsights = dna.linkedinInsights as LinkedInInsights | null;
  const draftConfiguration = dna.draftConfiguration as DraftConfiguration;
  const crawledPages = (dna.crawledPages as Array<{ url: string; pageType: string; title: string | null }>) ?? [];

  return (
    <div className="flex flex-col gap-6">
      {dna.status !== "AWAITING_REVIEW" && (
        <Card glass>
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-2">
              <Badge variant={dna.status === "APPROVED" ? "accent" : "outline"}>{dna.status === "APPROVED" ? "Approved" : "Rejected"}</Badge>
              <span className="text-sm text-muted-foreground">This profile has already been reviewed.</span>
            </div>
            {canManage && <RetryButton label="Re-analyze company" />}
          </CardContent>
        </Card>
      )}

      <VerifiedFactsCard crawledPages={crawledPages} brandAssets={brandAssets} linkedinInsights={linkedinInsights} />

      <BusinessUnderstandingCard
        dnaId={dna.id}
        businessUnderstanding={businessUnderstanding}
        unknownFields={dna.unknownFields}
        editable={dna.status === "AWAITING_REVIEW" && canManage}
      />

      <ICPCard icp={icp} />

      <SwotCard swot={swot} />

      <OpportunitiesCard opportunities={opportunities} />

      <CompetitorsCard competitors={dna.competitors} />

      {dna.executiveMeeting && <ExecutiveMeetingCard meeting={dna.executiveMeeting} />}

      {dna.status === "AWAITING_REVIEW" && canManage && (
        <DraftConfigurationCard dnaId={dna.id} draftConfiguration={draftConfiguration} />
      )}
    </div>
  );
}

function EmptyState({
  title,
  description,
  hasWebsite,
  canManage,
}: {
  title: string;
  description: string;
  hasWebsite: boolean;
  canManage: boolean;
}) {
  return (
    <Card glass>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {hasWebsite && canManage && (
        <CardContent>
          <RetryButton label="Start analysis" />
        </CardContent>
      )}
    </Card>
  );
}

function RetryButton({ label }: { label: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await retryCompanyDiscoveryAction();
          if (!result.ok) toast.error(result.error ?? "Could not start analysis.");
          else {
            toast.success("Analysis started.");
            router.refresh();
          }
        })
      }
    >
      {pending ? "Starting…" : label}
    </Button>
  );
}

function ConfidenceBadge({ score }: { score: number | undefined }) {
  if (score === undefined) return null;
  const variant = score >= 70 ? "accent" : score >= 40 ? "outline" : "secondary";
  return <Badge variant={variant}>{score}% confidence</Badge>;
}

function VerifiedFactsCard({
  crawledPages,
  brandAssets,
  linkedinInsights,
}: {
  crawledPages: Array<{ url: string; pageType: string; title: string | null }>;
  brandAssets: BrandAssets;
  linkedinInsights: LinkedInInsights | null;
}) {
  return (
    <Card glass>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Verified <Badge variant="accent">from your website</Badge>
        </CardTitle>
        <CardDescription>Real facts read directly from your site — never guessed.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <div>
          <p className="mb-1 font-medium text-foreground">Pages crawled ({crawledPages.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {crawledPages.map((p) => (
              <a key={p.url} href={p.url} target="_blank" rel="noreferrer">
                <Badge variant="outline">{p.pageType}</Badge>
              </a>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Logo" value={brandAssets.logoUrl} isLink />
          <Field label="Contact email" value={brandAssets.contactEmail} />
          <Field label="Contact phone" value={brandAssets.contactPhone} />
          <Field label="Business hours" value={brandAssets.businessHours} />
        </div>
        {brandAssets.colors.length > 0 && (
          <div>
            <p className="mb-1 font-medium text-foreground">Brand colors</p>
            <div className="flex gap-2">
              {brandAssets.colors.map((c) => (
                <span key={c} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-4 rounded border border-border" style={{ backgroundColor: c }} />
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}
        {Object.keys(brandAssets.socialLinks).length > 0 && (
          <div>
            <p className="mb-1 font-medium text-foreground">Social links</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(brandAssets.socialLinks).map(([key, url]) => (
                <a key={key} href={url} target="_blank" rel="noreferrer" className="text-primary underline">
                  {key}
                </a>
              ))}
            </div>
          </div>
        )}
        {linkedinInsights && (
          <div className="border-t border-border pt-3">
            <p className="mb-1 font-medium text-foreground">LinkedIn (publicly indexed only)</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Industry" value={linkedinInsights.industry} />
              <Field label="Company size" value={linkedinInsights.companySizeRange} />
              <Field label="Employees (est.)" value={linkedinInsights.employeeCountEstimate} />
              <Field label="Followers" value={linkedinInsights.followers} />
              <Field label="Headquarters" value={linkedinInsights.headquarters} />
              <Field label="Growth trends" value={linkedinInsights.growthTrends} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, value, isLink }: { label: string; value: string | null | undefined; isLink?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      {value ? (
        isLink ? (
          <a href={value} target="_blank" rel="noreferrer" className="text-sm text-primary underline">
            {value}
          </a>
        ) : (
          <p className="text-sm text-foreground">{value}</p>
        )
      ) : (
        <Badge variant="secondary">Unknown</Badge>
      )}
    </div>
  );
}

function BusinessUnderstandingCard({
  dnaId,
  businessUnderstanding,
  unknownFields,
  editable,
}: {
  dnaId: string;
  businessUnderstanding: BusinessUnderstanding;
  unknownFields: string[];
  editable: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [industry, setIndustry] = useState(businessUnderstanding.industry ?? "");
  const [businessModel, setBusinessModel] = useState(businessUnderstanding.businessModel ?? "");
  const [targetMarket, setTargetMarket] = useState(businessUnderstanding.targetMarket ?? "");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const isUnknown = (field: string) => unknownFields.includes(`businessUnderstanding.${field}`);

  return (
    <Card glass>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            AI Inference — Business Understanding <ConfidenceBadge score={businessUnderstanding.confidenceScore} />
          </CardTitle>
          <CardDescription>What AI determined about your business — an inference, not a verified fact.</CardDescription>
        </div>
        {editable && (
          <Button variant="outline" size="sm" onClick={() => setEditing((e) => !e)}>
            {editing ? "Cancel" : "Edit"}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {editing ? (
          <div className="flex flex-col gap-3">
            <FormField label="Industry" htmlFor="industry">
              <Input id="industry" value={industry} onChange={(e) => setIndustry(e.target.value)} />
            </FormField>
            <FormField label="Business model" htmlFor="businessModel">
              <Input id="businessModel" value={businessModel} onChange={(e) => setBusinessModel(e.target.value)} />
            </FormField>
            <FormField label="Target market" htmlFor="targetMarket">
              <Input id="targetMarket" value={targetMarket} onChange={(e) => setTargetMarket(e.target.value)} />
            </FormField>
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await updateBusinessUnderstandingAction({ dnaId, industry, businessModel, targetMarket });
                  if (!result.ok) toast.error(result.error ?? "Could not save.");
                  else {
                    toast.success("Saved.");
                    setEditing(false);
                    router.refresh();
                  }
                })
              }
            >
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Industry" value={businessUnderstanding.industry} />
            <Field label="Business model" value={businessUnderstanding.businessModel} />
            <Field label="Target market" value={businessUnderstanding.targetMarket} />
            <Field label="Business stage" value={businessUnderstanding.businessStage} />
            <Field label="Market position" value={businessUnderstanding.marketPosition} />
            <Field label="Digital maturity" value={businessUnderstanding.digitalMaturity} />
            <ListField label="Primary services" values={businessUnderstanding.primaryServices} isUnknown={isUnknown("primaryServices")} />
            <ListField label="Products" values={businessUnderstanding.products} isUnknown={isUnknown("products")} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ListField({ label, values, isUnknown }: { label: string; values: string[]; isUnknown?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      {values.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {values.map((v) => (
            <Badge key={v} variant="outline">
              {v}
            </Badge>
          ))}
        </div>
      ) : (
        <Badge variant="secondary">{isUnknown ? "Unknown" : "None"}</Badge>
      )}
    </div>
  );
}

function ICPCard({ icp }: { icp: ICP }) {
  return (
    <Card glass>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          AI Inference — Ideal Customer Profile <ConfidenceBadge score={icp.confidenceScore} />
        </CardTitle>
        <CardDescription>A proposed ICP — a definitive one needs your own sales data over time.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <ListField label="Ideal industries" values={icp.idealIndustries} />
        <Field label="Ideal company size" value={icp.idealCompanySize} />
        <Field label="Budget range" value={icp.budgetRange} />
        <Field label="Sales cycle" value={icp.salesCycle} />
        <ListField label="Pain points" values={icp.painPoints} />
        <ListField label="Decision makers" values={icp.decisionMakers} />
      </CardContent>
    </Card>
  );
}

function SwotCard({ swot }: { swot: SWOT }) {
  const groups: Array<{ label: string; items: string[] }> = [
    { label: "Strengths", items: swot.strengths },
    { label: "Weaknesses", items: swot.weaknesses },
    { label: "Opportunities", items: swot.opportunities },
    { label: "Threats", items: swot.threats },
  ];
  return (
    <Card glass>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          AI Inference — SWOT Analysis <ConfidenceBadge score={swot.confidenceScore} />
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {groups.map((g) => (
          <div key={g.label}>
            <p className="mb-1 text-sm font-medium text-foreground">{g.label}</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {g.items.length > 0 ? g.items.map((i) => <li key={i}>{i}</li>) : <li>None identified</li>}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function OpportunitiesCard({ opportunities }: { opportunities: BusinessOpportunities }) {
  return (
    <Card glass>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          AI Inference — Business Opportunities <ConfidenceBadge score={opportunities.confidenceScore} />
        </CardTitle>
        <CardDescription>Only opportunities with a real evidence citation from your audit/profile data.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {opportunities.opportunities.length === 0 && <p className="text-sm text-muted-foreground">No specific opportunities identified.</p>}
        {opportunities.opportunities.map((o) => (
          <div key={o.title} className="rounded-lg border border-border p-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">{o.title}</p>
              <Badge variant={o.estimatedImpact === "high" ? "accent" : "outline"}>{o.estimatedImpact} impact</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{o.description}</p>
            <p className="mt-1 text-xs text-muted-foreground">Evidence: {o.evidence}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function CompetitorsCard({ competitors }: { competitors: CompetitorProp[] }) {
  return (
    <Card glass>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Competitors <Badge variant="secondary">AI web search — not independently verified</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {competitors.length === 0 && <p className="text-sm text-muted-foreground">No competitors found via web search.</p>}
        {competitors.map((c) => (
          <div key={c.id} className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">{c.name}</p>
              {c.website && (
                <a href={c.website} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                  {c.website}
                </a>
              )}
            </div>
            {c.positioning && <p className="mt-1 text-sm text-muted-foreground">{c.positioning}</p>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ExecutiveMeetingCard({ meeting }: { meeting: { id: string; title: string; summary: string | null; notesJson: unknown } }) {
  const notes = meeting.notesJson as { actionItems?: string[]; recommendations?: string[] } | null;
  return (
    <Card glass>
      <CardHeader>
        <CardTitle>AI Executive Board — {meeting.title}</CardTitle>
        <CardDescription>Ran automatically before this review — see the full transcript on the Board page.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {meeting.summary && <p className="text-sm text-muted-foreground">{meeting.summary}</p>}
        {notes?.recommendations && notes.recommendations.length > 0 && (
          <div>
            <p className="mb-1 text-sm font-medium text-foreground">Recommendations</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {notes.recommendations.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        )}
        <Link href={`/board/meetings/${meeting.id}`} className="text-sm text-primary underline">
          View full meeting →
        </Link>
      </CardContent>
    </Card>
  );
}

function DraftConfigurationCard({ dnaId, draftConfiguration }: { dnaId: string; draftConfiguration: DraftConfiguration }) {
  const [widgets, setWidgets] = useState<string[]>(draftConfiguration.dashboardWidgets);
  const [templates, setTemplates] = useState<string[]>(draftConfiguration.workflowTemplateNames);
  const [articles, setArticles] = useState<string[]>(draftConfiguration.knowledgeArticles.map((a) => a.title));
  const [stageRenames, setStageRenames] = useState(draftConfiguration.dealStageRenames.length > 0);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const toggle = (list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  const hasProposals =
    draftConfiguration.dashboardWidgets.length +
      draftConfiguration.workflowTemplateNames.length +
      draftConfiguration.knowledgeArticles.length +
      draftConfiguration.dealStageRenames.length >
    0;

  return (
    <Card glass>
      <CardHeader>
        <CardTitle>Draft Configuration</CardTitle>
        <CardDescription>Nothing here is live yet. Choose what to apply, then Approve — or Reject to discard everything.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {!hasProposals && <p className="text-sm text-muted-foreground">AI didn&apos;t propose any configuration changes.</p>}

        {draftConfiguration.dashboardWidgets.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Dashboard widgets</p>
            <div className="flex flex-col gap-1.5">
              {draftConfiguration.dashboardWidgets.map((w) => (
                <label key={w} className="flex items-center gap-2 text-sm text-foreground">
                  <input type="checkbox" checked={widgets.includes(w)} onChange={() => toggle(widgets, setWidgets, w)} />
                  {w}
                </label>
              ))}
            </div>
          </div>
        )}

        {draftConfiguration.workflowTemplateNames.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Automation templates (installed as Draft workflows)</p>
            <div className="flex flex-col gap-1.5">
              {draftConfiguration.workflowTemplateNames.map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm text-foreground">
                  <input type="checkbox" checked={templates.includes(t)} onChange={() => toggle(templates, setTemplates, t)} />
                  {t}
                </label>
              ))}
            </div>
          </div>
        )}

        {draftConfiguration.knowledgeArticles.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Knowledge Base articles (created as Draft)</p>
            <div className="flex flex-col gap-1.5">
              {draftConfiguration.knowledgeArticles.map((a) => (
                <label key={a.title} className="flex items-center gap-2 text-sm text-foreground">
                  <input type="checkbox" checked={articles.includes(a.title)} onChange={() => toggle(articles, setArticles, a.title)} />
                  {a.title}
                </label>
              ))}
            </div>
          </div>
        )}

        {draftConfiguration.dealStageRenames.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">CRM stage renames</p>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={stageRenames} onChange={(e) => setStageRenames(e.target.checked)} />
              Apply {draftConfiguration.dealStageRenames.length} suggested stage rename(s) — only applied to stages you haven&apos;t already
              customized
            </label>
          </div>
        )}

        {showReject ? (
          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <FormField label="Reason (optional)" htmlFor="rejectReason">
              <textarea
                id="rejectReason"
                rows={2}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </FormField>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await rejectCompanyDNAAction(dnaId, rejectReason);
                    if (!result.ok) toast.error(result.error ?? "Could not reject.");
                    else {
                      toast.success("Rejected — nothing was applied.");
                      router.refresh();
                    }
                  })
                }
              >
                {pending ? "Rejecting…" : "Confirm reject"}
              </Button>
              <Button variant="ghost" onClick={() => setShowReject(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2 border-t border-border pt-4">
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await approveCompanyDNAAction({
                    dnaId,
                    approvedWidgets: widgets as WidgetType[],
                    approvedTemplateNames: templates,
                    approvedArticleTitles: articles,
                    approveDealStageRenames: stageRenames,
                  });
                  if (!result.ok) toast.error(result.error ?? "Could not approve.");
                  else {
                    toast.success("Approved — your selections are now live.");
                    router.refresh();
                  }
                })
              }
            >
              {pending ? "Applying…" : "Approve"}
            </Button>
            <Button variant="outline" onClick={() => setShowReject(true)}>
              Reject
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
