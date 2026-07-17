"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, HeartPulse, ArrowRight } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { generateCustomerSuccessDigestAction } from "../actions";

export interface LatestDigest {
  id: string;
  narrativeSummary: string | null;
  createdAt: string;
}

export function CustomerSuccessDigestPanel({ latestDigest }: { latestDigest: LatestDigest | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      const result = await generateCustomerSuccessDigestAction();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong generating the digest.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card glass>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <HeartPulse className="size-4 text-primary" /> Customer Success Agent
            </CardTitle>
            <CardDescription>Real portfolio digest — health, churn risk, and opportunities across every client. No fabricated data.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleGenerate} disabled={pending}>
            <Sparkles className="size-4" />
            {pending ? "Generating…" : "Generate digest"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!latestDigest ? (
          <p className="text-sm text-muted-foreground">No digest generated yet. Click &quot;Generate digest&quot; for a real read of your client portfolio.</p>
        ) : (
          <>
            {latestDigest.narrativeSummary && <p className="text-sm text-foreground">{latestDigest.narrativeSummary}</p>}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Generated {new Date(latestDigest.createdAt).toLocaleString()}</span>
              <Link href={`/board/brief/${latestDigest.id}`} className="flex items-center gap-1 text-primary hover:underline">
                Full digest <ArrowRight className="size-3" />
              </Link>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
