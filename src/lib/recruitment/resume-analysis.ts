import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { generateStructured } from "@/lib/ai/fallback";
import { recordAIUsage } from "@/lib/billing/ai-credits";
import { isAIConnected } from "@/lib/ai/client";
import { getPersona } from "@/lib/ai/personas";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Recruitment Agent — resume analysis. Accepts pasted resume text directly
 * (resumeText) rather than parsing an uploaded PDF/DOCX — a real, honest
 * scope boundary: document parsing is a separate concern this app has no
 * existing pipeline for, so this doesn't fabricate one. Candidate.resumeStorageKey
 * stays available for a future file-upload integration without a schema change.
 */

const SkillSchema = z.object({
  name: z.string().trim().min(1),
  // Real AI self-reported confidence, never silently upgraded to certain —
  // same discipline as OrganizationDNA.confidence.
  confidenceScore: z.number().min(0).max(100),
});
const ResumeAnalysisSchema = z.object({
  skills: z.array(SkillSchema).max(20),
  summary: z.string().trim().min(1).max(500),
});

export interface ResumeAnalysisResult {
  skills: Array<{ name: string; confidenceScore: number; verificationMethod: "ai-resume-extraction" }>;
  summary: string;
  /** Deterministic keyword-overlap score against the parent JobOpening's real description — NEVER AI-invented. */
  matchScore: number;
}

function computeDeterministicMatchScore(resumeText: string, jobDescription: string): number {
  const tokenize = (text: string) => new Set(text.toLowerCase().match(/[a-z][a-z0-9+.#]{2,}/g) ?? []);
  const jobTokens = tokenize(jobDescription);
  const resumeTokens = tokenize(resumeText);
  if (jobTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of jobTokens) if (resumeTokens.has(token)) overlap += 1;
  return Math.round((overlap / jobTokens.size) * 100);
}

export async function analyzeCandidateResume(candidateId: string, organizationId: string, resumeText: string): Promise<ResumeAnalysisResult> {
  const candidate = await prisma.candidate.findUnique({ where: { id: candidateId }, include: { jobOpening: true } });
  if (!candidate || candidate.organizationId !== organizationId) throw new Error("Candidate not found.");

  const matchScore = computeDeterministicMatchScore(resumeText, candidate.jobOpening.description);

  let skills: ResumeAnalysisResult["skills"] = [];
  let summary = "";
  if (isAIConnected()) {
    const persona = getPersona("RECRUITMENT");
    const result = await generateStructured({
      system: `${persona.systemPrompt}\n\nExtract real skills actually mentioned in this resume text, each with an honest confidence score (0-100) for how clearly it's evidenced — never invent a skill not in the text, and never report a low-evidence skill as fully certain.`,
      userContent: `Job: "${candidate.jobOpening.title}"\n\nResume text:\n${resumeText.slice(0, 6000)}`,
      maxTokens: 1024,
      effort: "low",
      schema: ResumeAnalysisSchema,
    });
    await recordAIUsage(organizationId, result.provider, result.model, result.inputTokens, result.outputTokens, "recruitment:resume-analysis");
    skills = result.parsed.skills.map((s) => ({ ...s, verificationMethod: "ai-resume-extraction" as const }));
    summary = result.parsed.summary;
  }

  // The deterministic matchScore is always real and saved regardless of AI
  // availability; skillsExtracted stays honestly null (never a fabricated
  // empty-but-"analyzed" state) when no AI provider is configured.
  await prisma.candidate.update({
    where: { id: candidateId },
    data: {
      matchScore,
      skillsExtracted: (skills.length > 0 ? { skills, summary } : null) as unknown as Prisma.InputJsonValue,
    },
  });

  return { skills, summary, matchScore };
}
