"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { AiErrorBanner, type AIErrorKind } from "@/app/board/_components/ai-error-banner";
import { createAbTestForCampaign, type AbVariantStats } from "../_lib/ab-test-actions";
import type { DraftChannel, DraftPurpose, EmailTone } from "@/generated/prisma/client";

const TONE_OPTIONS: EmailTone[] = ["PROFESSIONAL", "ENTERPRISE", "FRIENDLY", "FORMAL", "CONSULTATIVE"];

export function AbTestPanel({ campaignId, results }: { campaignId: string; results: AbVariantStats[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [purpose, setPurpose] = useState<DraftPurpose>("INTRODUCTION");
  const [channel, setChannel] = useState<DraftChannel>("EMAIL");
  const [toneA, setToneA] = useState<EmailTone>("PROFESSIONAL");
  const [toneB, setToneB] = useState<EmailTone>("FRIENDLY");
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<AIErrorKind>(undefined);

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const result = await createAbTestForCampaign(campaignId, purpose, channel, toneA, toneB);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        setErrorKind(result.errorKind);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card glass>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FlaskConical className="size-4 text-primary" /> A/B testing
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-0">
        {error && <AiErrorBanner error={error} kind={errorKind} />}

        {results.length === 0 ? (
          <>
            <p className="text-sm text-muted-foreground">
              Splits this campaign&apos;s contacts into two real groups and generates a genuinely distinct AI
              variant for each — real performance is tracked separately per variant.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Select value={toneA} onChange={(e) => setToneA(e.target.value as EmailTone)} className="h-9 text-sm">
                {TONE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    Variant A: {t}
                  </option>
                ))}
              </Select>
              <Select value={toneB} onChange={(e) => setToneB(e.target.value as EmailTone)} className="h-9 text-sm">
                {TONE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    Variant B: {t}
                  </option>
                ))}
              </Select>
              <Select value={channel} onChange={(e) => setChannel(e.target.value as DraftChannel)} className="h-9 text-sm">
                <option value="EMAIL">Email</option>
                <option value="LINKEDIN">LinkedIn</option>
              </Select>
              <Select value={purpose} onChange={(e) => setPurpose(e.target.value as DraftPurpose)} className="h-9 text-sm">
                <option value="INTRODUCTION">Introduction</option>
                <option value="FOLLOW_UP">Follow-up</option>
                <option value="RE_ENGAGEMENT">Re-engagement</option>
              </Select>
            </div>
            <Button size="sm" onClick={handleCreate} disabled={pending}>
              {pending ? "Generating variants…" : "Create A/B test"}
            </Button>
          </>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {results.map((r) => (
              <div key={r.variant} className="rounded-lg border border-border p-3">
                <p className="text-sm font-semibold text-foreground">Variant {r.variant}</p>
                {r.sampleSubject && <p className="mt-1 text-xs text-muted-foreground">{r.sampleSubject}</p>}
                <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <p className="font-semibold text-foreground">{r.openRate}%</p>
                    <p className="text-muted-foreground">Open</p>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{r.clickRate}%</p>
                    <p className="text-muted-foreground">Click</p>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{r.replyRate}%</p>
                    <p className="text-muted-foreground">Reply</p>
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">{r.sentCount} of {r.count} sent</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
