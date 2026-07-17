"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { moveCandidateStageAction, analyzeResumeAction } from "../../../_lib/actions";
import type { CandidateStage } from "@/generated/prisma/client";

const STAGES: CandidateStage[] = ["APPLIED", "SCREENING", "INTERVIEW", "OFFER", "HIRED", "REJECTED"];

interface SkillsExtracted {
  skills: Array<{ name: string; confidenceScore: number }>;
  summary: string;
}

export function CandidateCard({
  candidateId,
  name,
  email,
  stage,
  matchScore,
  skillsExtracted,
}: {
  candidateId: string;
  name: string;
  email: string | null;
  stage: CandidateStage;
  matchScore: number | null;
  skillsExtracted: SkillsExtracted | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [resumeOpen, setResumeOpen] = useState(false);
  const [resumeText, setResumeText] = useState("");

  function handleStageChange(next: string) {
    startTransition(async () => {
      const result = await moveCandidateStageAction(candidateId, next as CandidateStage);
      if (!result.ok) {
        toast.error(result.error ?? "Could not move candidate.");
        return;
      }
      toast.success(`Moved to ${next}.`);
      router.refresh();
    });
  }

  function handleAnalyze() {
    startTransition(async () => {
      const result = await analyzeResumeAction(candidateId, resumeText);
      if (!result.ok) {
        toast.error(result.error ?? "Could not analyze resume.");
        return;
      }
      toast.success("Resume analyzed.");
      setResumeOpen(false);
      setResumeText("");
      router.refresh();
    });
  }

  return (
    <Card glass>
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="font-medium text-foreground">{name}</p>
            {email && <p className="text-xs text-muted-foreground">{email}</p>}
          </div>
          <Select value={stage} onChange={(e) => handleStageChange(e.target.value)} disabled={pending} className="h-9 w-32">
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>

        {matchScore != null && (
          <p className="text-xs text-muted-foreground">Deterministic keyword match vs. job description: {matchScore}%</p>
        )}

        {skillsExtracted ? (
          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">{skillsExtracted.summary}</p>
            <div className="flex flex-wrap gap-1">
              {skillsExtracted.skills.map((s) => (
                <Badge key={s.name} variant="outline" className="text-[10px]">
                  {s.name} ({s.confidenceScore}%)
                </Badge>
              ))}
            </div>
          </div>
        ) : resumeOpen ? (
          <div className="flex flex-col gap-2">
            <textarea
              placeholder="Paste resume text..."
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              className="min-h-24 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={handleAnalyze} disabled={pending}>
                <Sparkles className="size-3.5" /> Analyze
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setResumeOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={() => setResumeOpen(true)} className="self-start">
            <Sparkles className="size-3.5" /> Analyze resume
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
