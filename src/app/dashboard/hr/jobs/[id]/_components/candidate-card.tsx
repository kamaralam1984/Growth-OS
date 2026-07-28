"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { FileText, Sparkles, Upload } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { moveCandidateStageAction, analyzeResumeAction, uploadResumeAction } from "../../../_lib/actions";
import type { CandidateStage } from "@/generated/prisma/client";

const STAGES: CandidateStage[] = ["APPLIED", "SCREENING", "INTERVIEW", "OFFER", "HIRED", "REJECTED"];

interface SkillsExtracted {
  skills: Array<{ name: string; confidenceScore: number }>;
  summary: string;
}

export function CandidateCard({
  candidateId,
  organizationId,
  name,
  email,
  stage,
  matchScore,
  skillsExtracted,
  hasResume,
}: {
  candidateId: string;
  organizationId: string;
  name: string;
  email: string | null;
  stage: CandidateStage;
  matchScore: number | null;
  skillsExtracted: SkillsExtracted | null;
  hasResume: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [resumeOpen, setResumeOpen] = useState(false);
  const [resumeText, setResumeText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    startTransition(async () => {
      const result = await uploadResumeAction(candidateId, file);
      if (!result.ok) {
        toast.error(result.error ?? "Could not process resume.");
        return;
      }
      toast.success("Resume uploaded and analyzed.");
      setResumeOpen(false);
      router.refresh();
    });
    e.target.value = "";
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

        {hasResume && (
          <a
            href={`/api/organizations/${organizationId}/candidates/${candidateId}/resume`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <FileText className="size-3.5" /> View uploaded resume
          </a>
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
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleFileSelected}
              className="hidden"
            />
            <Button type="button" size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={pending} className="self-start">
              <Upload className="size-3.5" /> Upload PDF/DOCX
            </Button>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> or paste text <span className="h-px flex-1 bg-border" />
            </div>
            <textarea
              placeholder="Paste resume text..."
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              className="min-h-24 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={handleAnalyze} disabled={pending || !resumeText.trim()}>
                <Sparkles className="size-3.5" /> Analyze pasted text
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
