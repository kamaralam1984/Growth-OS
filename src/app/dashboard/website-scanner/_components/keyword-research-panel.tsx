"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Search } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FormField } from "@/components/ui/form-field";
import { researchSeoKeywords } from "../actions";
import type { SeoKeyword } from "@/lib/seo/agent";

export interface KeywordResearchRow {
  id: string;
  topic: string;
  keywords: SeoKeyword[];
  createdAt: string;
}

const DIFFICULTY_VARIANT: Record<string, "outline" | "accent" | "default" | "secondary"> = {
  LOW: "default",
  MEDIUM: "accent",
  HIGH: "secondary",
};

export function KeywordResearchPanel({ initialResearch }: { initialResearch: KeywordResearchRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [topic, setTopic] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await researchSeoKeywords(topic);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong researching keywords.");
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
              label="Topic or seed keyword"
              htmlFor="keyword-topic"
              required
              hint="AI searches the live web for real, currently-relevant keywords — never invented search volumes."
            >
              <div className="flex gap-2">
                <Input
                  id="keyword-topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. project management software for agencies"
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

      {initialResearch.length === 0 ? (
        <Card glass>
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <Sparkles className="size-8 text-muted-foreground" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">No keyword research yet. Enter a topic above to run the SEO Agent&apos;s first search.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {initialResearch.map((research) => (
            <Card key={research.id} glass>
              <CardContent className="flex flex-col gap-3 p-5">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-foreground">{research.topic}</p>
                  <p className="text-xs text-muted-foreground">{new Date(research.createdAt).toLocaleString()}</p>
                </div>
                {research.keywords.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No keywords surfaced for this search.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {research.keywords.map((kw, i) => (
                      <div key={`${research.id}-${i}`} className="flex flex-col gap-1 rounded-lg border border-border/60 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-foreground">{kw.keyword}</span>
                          {kw.intent && (
                            <Badge variant="outline" className="text-xs">
                              {kw.intent}
                            </Badge>
                          )}
                          {kw.estimatedDifficulty && (
                            <Badge variant={DIFFICULTY_VARIANT[kw.estimatedDifficulty] ?? "outline"} className="text-xs">
                              {kw.estimatedDifficulty} difficulty
                            </Badge>
                          )}
                        </div>
                        {kw.evidenceNote && <p className="text-xs text-muted-foreground">{kw.evidenceNote}</p>}
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
