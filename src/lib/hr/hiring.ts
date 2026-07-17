import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { generateStructured } from "@/lib/ai/fallback";
import { recordAIUsage } from "@/lib/billing/ai-credits";
import { AINotConnectedError, isAIConnected } from "@/lib/ai/client";
import { getPersona } from "@/lib/ai/personas";
import type { JobOpening, Candidate, Interview, CandidateStage, InterviewStatus } from "@/generated/prisma/client";

/** HR Agent — real hiring pipeline (JobOpening/Candidate/Interview), reused by both the HR and Recruitment agents (they operate on the same real data, differentiated by which slice of the pipeline each persona focuses on). */

export interface CreateJobOpeningInput {
  organizationId: string;
  title: string;
  department?: string;
  description: string;
  createdByUserId?: string;
}

export async function createJobOpening(input: CreateJobOpeningInput): Promise<JobOpening> {
  return prisma.jobOpening.create({
    data: {
      organizationId: input.organizationId,
      title: input.title,
      department: input.department ?? null,
      description: input.description,
      createdByUserId: input.createdByUserId ?? null,
    },
  });
}

const JobDescriptionSchema = z.object({ description: z.string().trim().min(1) });

/**
 * Real AI draft, grounded in the org's real services/industry from
 * OrganizationDNA (never invented requirements) — always editable by a
 * human afterward via createJobOpening/updateJobOpening, never
 * auto-published.
 */
export async function generateJobDescription(organizationId: string, title: string, department?: string): Promise<string> {
  if (!isAIConnected()) throw new AINotConnectedError();

  const dna = await prisma.organizationDNA.findFirst({ where: { organizationId, status: "APPROVED" }, orderBy: { version: "desc" }, select: { businessUnderstanding: true } });
  const businessUnderstanding = dna?.businessUnderstanding as { industry?: string; primaryServices?: string[] } | undefined;

  const persona = getPersona("HR");
  const result = await generateStructured({
    system: `${persona.systemPrompt}\n\nDraft a real, specific job description. Ground it in the organization's real industry/services given below when available — never invent unrelated requirements.`,
    userContent: `Role: "${title}"${department ? ` in the ${department} department` : ""}.\n${businessUnderstanding?.industry ? `Organization industry: ${businessUnderstanding.industry}.` : "No confirmed industry on file."}\n${businessUnderstanding?.primaryServices?.length ? `Real services: ${businessUnderstanding.primaryServices.join(", ")}.` : ""}\n\nWrite a complete job description: responsibilities, requirements, and what success looks like in this role.`,
    maxTokens: 1024,
    effort: "low",
    schema: JobDescriptionSchema,
  });
  await recordAIUsage(organizationId, result.provider, result.model, result.inputTokens, result.outputTokens, "hr:job-description");

  return result.parsed.description;
}

export async function moveCandidateStage(candidateId: string, organizationId: string, stage: CandidateStage): Promise<Candidate> {
  const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
  if (!candidate || candidate.organizationId !== organizationId) throw new Error("Candidate not found.");
  return prisma.candidate.update({ where: { id: candidateId }, data: { stage } });
}

export interface ScheduleInterviewInput {
  candidateId: string;
  organizationId: string;
  scheduledAt: Date;
  interviewerUserId?: string;
}

export async function scheduleInterview(input: ScheduleInterviewInput): Promise<Interview> {
  const candidate = await prisma.candidate.findUnique({ where: { id: input.candidateId } });
  if (!candidate || candidate.organizationId !== input.organizationId) throw new Error("Candidate not found.");

  if (input.interviewerUserId) {
    const interviewerMembership = await prisma.membership.findFirst({
      where: { userId: input.interviewerUserId, organizationId: input.organizationId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!interviewerMembership) throw new Error("Interviewer must be an active member of this organization.");
  }

  const interview = await prisma.interview.create({
    data: { candidateId: input.candidateId, scheduledAt: input.scheduledAt, interviewerUserId: input.interviewerUserId ?? null },
  });
  if (candidate.stage === "APPLIED" || candidate.stage === "SCREENING") {
    await prisma.candidate.update({ where: { id: input.candidateId }, data: { stage: "INTERVIEW" } });
  }
  return interview;
}

export async function recordInterviewFeedback(interviewId: string, organizationId: string, status: InterviewStatus, feedback?: string, rating?: number): Promise<Interview> {
  const interview = await prisma.interview.findUnique({ where: { id: interviewId }, include: { candidate: true } });
  if (!interview || interview.candidate.organizationId !== organizationId) throw new Error("Interview not found.");

  return prisma.interview.update({ where: { id: interviewId }, data: { status, feedback: feedback ?? null, rating: rating ?? null } });
}
