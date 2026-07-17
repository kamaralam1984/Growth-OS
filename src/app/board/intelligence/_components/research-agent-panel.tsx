"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, FlaskConical } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FormField } from "@/components/ui/form-field";
import { runResearchBrief } from "../actions";

interface ResearchFindingRow {
  title: string;
  description: string;
  signalStrength: "EMERGING" | "GROWING" | "ESTABLISHED";
  evidenceUrls: string[];
}

interface ResearchOpportunityRow {
  title: string;
  description: string;
  relatedFindingTitle: string;
}

export interface ResearchBriefRow {
  id: string;
  topic: string;
  findings: ResearchFindingRow[];
  opportunities: ResearchOpportunityRow[];
  createdAt: string;
}

export function ResearchAgentPanel({ initialBriefs }: { initialBriefs: ResearchBriefRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [topic, setTopic] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await runResearchBrief(topic);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong researching that topic.");
        return;
      }
      setTopic("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card glass>
        <CardContent className="p-5">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <FormField
              label="Company or topic to research"
              htmlFor="research-topic"
              required
              hint="Ad-hoc, real live web search — company research, industry research, competitor intelligence, market trends, or technology analysis, on demand."
            >
              <div className="flex gap-2">
                <Input
                  id="research-topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. Acme Corp, or 'AI adoption in logistics'"
                  required
                  disabled={pending}
                />
                <Button type="submit" disabled={pending || topic.trim().length < 2}>
                  <Search className="size-4" />
                  {pending ? "Researching…" : "Research"}
                </Button>
              </div>
            </FormField>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>
        </CardContent>
      </Card>

      {initialBriefs.length === 0 ? (
        <Card glass>
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <FlaskConical className="size-8 text-muted-foreground" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">No research briefs yet. Enter a company or topic above to run the Research Agent&apos;s first search.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {initialBriefs.map((brief) => (
            <Card key={brief.id} glass>
              <CardContent className="flex flex-col gap-3 p-5">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-2 font-medium text-foreground">
                    {brief.topic} <Badge variant="secondary">AI web search — not independently verified</Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">{new Date(brief.createdAt).toLocaleString()}</p>
                </div>
                {brief.findings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No findings surfaced for this search.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {brief.findings.map((f, i) => (
                      <div key={`${brief.id}-finding-${i}`} className="rounded-lg border border-border/60 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-foreground">{f.title}</span>
                          <Badge variant="outline">{f.signalStrength}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{f.description}</p>
                      </div>
                    ))}
                  </div>
                )}
                {brief.opportunities.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Related opportunities</p>
                    {brief.opportunities.map((o, i) => (
                      <div key={`${brief.id}-opp-${i}`} className="rounded-lg border border-border/60 p-3">
                        <p className="text-sm font-medium text-foreground">{o.title}</p>
                        <p className="text-sm text-muted-foreground">{o.description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
