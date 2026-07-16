"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, FileSearch } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { AiErrorBanner, type AIErrorKind } from "@/app/board/_components/ai-error-banner";
import { generateIntelligenceReport, generateNote } from "../_lib/intelligence-actions";
import type { ResearchTopic } from "@/generated/prisma/client";

const TOPIC_OPTIONS: Array<{ value: ResearchTopic; label: string }> = [
  { value: "COMPETITORS", label: "Competitors" },
  { value: "TECHNOLOGY", label: "Technology" },
  { value: "BUSINESS_MODEL", label: "Business model" },
  { value: "EXPANSION", label: "Expansion" },
  { value: "NEWS", label: "News" },
  { value: "HIRING_TRENDS", label: "Hiring trends" },
  { value: "PUBLIC_SIGNALS", label: "Public signals" },
  { value: "GENERAL", label: "General" },
];

export interface CompanyIntelligenceReportView {
  id: string;
  businessSummary: string;
  productsSummary: string | null;
  servicesSummary: string | null;
  techStackSummary: string | null;
  digitalPresenceSummary: string | null;
  seoOverview: string | null;
  performanceOverview: string | null;
  growthSignals: string[];
  hiringSignals: string[];
  expansionIndicators: string[];
  businessOpportunities: string[];
  estimatedSoftwareNeeds: string[];
  potentialPainPoints: string[];
  recommendedSolution: string | null;
  estimatedProjectValue: number | null;
  confidenceScore: number;
  createdAt: string;
}

export interface CompanyResearchNoteView {
  id: string;
  topic: ResearchTopic;
  content: string;
  createdAt: string;
}

function SignalList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold text-foreground">{title}</p>
      <ul className="flex flex-col gap-1">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-muted-foreground before:mr-1.5 before:text-primary before:content-['•']">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CompanyIntelligencePanel({
  companyId,
  latestReport,
  notes,
}: {
  companyId: string;
  latestReport: CompanyIntelligenceReportView | null;
  notes: CompanyResearchNoteView[];
}) {
  const router = useRouter();
  const [generatingReport, startReport] = useTransition();
  const [generatingNote, startNote] = useTransition();
  const [topic, setTopic] = useState<ResearchTopic>("GENERAL");
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<AIErrorKind>(undefined);

  function handleGenerateReport() {
    setError(null);
    startReport(async () => {
      const result = await generateIntelligenceReport(companyId);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        setErrorKind(result.errorKind);
        return;
      }
      router.refresh();
    });
  }

  function handleGenerateNote() {
    setError(null);
    startNote(async () => {
      const result = await generateNote(companyId, topic);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        setErrorKind(result.errorKind);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card glass>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-primary" /> AI Company Intelligence report
          </CardTitle>
          <Button size="sm" onClick={handleGenerateReport} disabled={generatingReport}>
            {generatingReport ? "Researching the web…" : latestReport ? "Regenerate report" : "Generate report"}
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-0">
          {error && <AiErrorBanner error={error} kind={errorKind} />}
          {!latestReport ? (
            <p className="text-sm text-muted-foreground">
              No report yet. Generating one runs a real live web search via your Sales agent — nothing here is
              invented.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="accent">AI-generated</Badge>
                <Badge variant="outline">Confidence: {Math.round(latestReport.confidenceScore)}%</Badge>
                {latestReport.estimatedProjectValue != null && (
                  <Badge variant="outline">Est. project value: ${latestReport.estimatedProjectValue.toLocaleString()}</Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  Generated {new Date(latestReport.createdAt).toLocaleString()}
                </span>
              </div>

              <div>
                <p className="text-xs font-semibold text-foreground">Business summary</p>
                <p className="mt-1 text-sm text-muted-foreground">{latestReport.businessSummary}</p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {latestReport.productsSummary && (
                  <div>
                    <p className="text-xs font-semibold text-foreground">Products</p>
                    <p className="mt-1 text-sm text-muted-foreground">{latestReport.productsSummary}</p>
                  </div>
                )}
                {latestReport.servicesSummary && (
                  <div>
                    <p className="text-xs font-semibold text-foreground">Services</p>
                    <p className="mt-1 text-sm text-muted-foreground">{latestReport.servicesSummary}</p>
                  </div>
                )}
                {latestReport.techStackSummary && (
                  <div>
                    <p className="text-xs font-semibold text-foreground">Tech stack</p>
                    <p className="mt-1 text-sm text-muted-foreground">{latestReport.techStackSummary}</p>
                  </div>
                )}
                {latestReport.digitalPresenceSummary && (
                  <div>
                    <p className="text-xs font-semibold text-foreground">Digital presence</p>
                    <p className="mt-1 text-sm text-muted-foreground">{latestReport.digitalPresenceSummary}</p>
                  </div>
                )}
                {latestReport.seoOverview && (
                  <div>
                    <p className="text-xs font-semibold text-foreground">SEO overview</p>
                    <p className="mt-1 text-sm text-muted-foreground">{latestReport.seoOverview}</p>
                  </div>
                )}
                {latestReport.performanceOverview && (
                  <div>
                    <p className="text-xs font-semibold text-foreground">Performance overview</p>
                    <p className="mt-1 text-sm text-muted-foreground">{latestReport.performanceOverview}</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <SignalList title="Growth signals" items={latestReport.growthSignals} />
                <SignalList title="Hiring signals" items={latestReport.hiringSignals} />
                <SignalList title="Expansion indicators" items={latestReport.expansionIndicators} />
                <SignalList title="Business opportunities" items={latestReport.businessOpportunities} />
                <SignalList title="Estimated software needs" items={latestReport.estimatedSoftwareNeeds} />
                <SignalList title="Potential pain points" items={latestReport.potentialPainPoints} />
              </div>

              {latestReport.recommendedSolution && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <p className="text-xs font-semibold text-primary">AI-recommended solution</p>
                  <p className="mt-1 text-sm text-foreground">{latestReport.recommendedSolution}</p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card glass>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSearch className="size-4" /> Research notes
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={topic} onChange={(e) => setTopic(e.target.value as ResearchTopic)} className="h-8 w-40 text-xs">
              {TOPIC_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
            <Button size="sm" variant="outline" onClick={handleGenerateNote} disabled={generatingNote}>
              {generatingNote ? "Researching…" : "Generate note"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pt-0">
          {notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No research notes yet.</p>
          ) : (
            notes.map((note) => (
              <div key={note.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <Badge variant="outline">{TOPIC_OPTIONS.find((t) => t.value === note.topic)?.label ?? note.topic}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(note.createdAt).toLocaleString()}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{note.content}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
