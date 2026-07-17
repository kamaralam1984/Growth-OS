"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { resolveActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { createJobOpening, generateJobDescription, moveCandidateStage, scheduleInterview, recordInterviewFeedback } from "@/lib/hr/hiring";
import { requestLeave, decideLeaveRequest } from "@/lib/hr/leave";
import { provisionOnboardingTasks } from "@/lib/hr/onboarding";
import { analyzeCandidateResume } from "@/lib/recruitment/resume-analysis";
import type { CandidateStage, InterviewStatus, LeaveType, LeaveRequestStatus } from "@/generated/prisma/client";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function createJobOpeningAction(input: { title: string; department?: string; description: string }): Promise<ActionResult & { jobOpeningId?: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };
  if (!input.title.trim()) return { ok: false, error: "Give the role a title." };
  if (!input.description.trim()) return { ok: false, error: "The job needs a description." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  const job = await createJobOpening({ organizationId: membership.organizationId, title: input.title, department: input.department, description: input.description, createdByUserId: userId });
  await logAudit({ userId, organizationId: membership.organizationId, action: "hr.job_opening_created", metadata: { jobOpeningId: job.id } });
  revalidatePath("/dashboard/hr");
  return { ok: true, jobOpeningId: job.id };
}

export async function generateJobDescriptionAction(title: string, department?: string): Promise<ActionResult & { description?: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  try {
    const description = await generateJobDescription(membership.organizationId, title, department);
    return { ok: true, description };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not generate a description." };
  }
}

export async function addCandidateAction(input: { jobOpeningId: string; name: string; email?: string; phone?: string; source?: string }): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };
  if (!input.name.trim()) return { ok: false, error: "Give the candidate a name." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  const jobOpening = await prisma.jobOpening.findUnique({ where: { id: input.jobOpeningId } });
  if (!jobOpening || jobOpening.organizationId !== membership.organizationId) return { ok: false, error: "Job opening not found." };

  await prisma.candidate.create({
    data: { organizationId: membership.organizationId, jobOpeningId: input.jobOpeningId, name: input.name.trim(), email: input.email || null, phone: input.phone || null, source: input.source || null },
  });
  revalidatePath(`/dashboard/hr/jobs/${input.jobOpeningId}`);
  return { ok: true };
}

export async function moveCandidateStageAction(candidateId: string, stage: CandidateStage): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };
  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  try {
    const candidate = await moveCandidateStage(candidateId, membership.organizationId, stage);
    if (stage === "HIRED") await provisionOnboardingTasks(candidateId, membership.organizationId, userId);
    revalidatePath(`/dashboard/hr/jobs/${candidate.jobOpeningId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not move candidate." };
  }
}

export async function scheduleInterviewAction(input: { candidateId: string; scheduledAt: string; interviewerUserId?: string }): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };
  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  try {
    const candidate = await prisma.candidate.findUnique({ where: { id: input.candidateId } });
    await scheduleInterview({ candidateId: input.candidateId, organizationId: membership.organizationId, scheduledAt: new Date(input.scheduledAt), interviewerUserId: input.interviewerUserId });
    revalidatePath(`/dashboard/hr/jobs/${candidate?.jobOpeningId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not schedule interview." };
  }
}

export async function recordInterviewFeedbackAction(interviewId: string, status: InterviewStatus, feedback?: string, rating?: number): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };
  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  try {
    await recordInterviewFeedback(interviewId, membership.organizationId, status, feedback, rating);
    revalidatePath("/dashboard/hr");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not record feedback." };
  }
}

export async function analyzeResumeAction(candidateId: string, resumeText: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };
  if (!resumeText.trim()) return { ok: false, error: "Paste the candidate's resume text first." };
  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  try {
    const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
    await analyzeCandidateResume(candidateId, membership.organizationId, resumeText);
    revalidatePath(`/dashboard/hr/jobs/${candidate?.jobOpeningId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not analyze resume." };
  }
}

export async function requestLeaveAction(input: { type: LeaveType; startDate: string; endDate: string; reason?: string }): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };
  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  try {
    await requestLeave({ organizationId: membership.organizationId, userId, type: input.type, startDate: new Date(input.startDate), endDate: new Date(input.endDate), reason: input.reason });
    revalidatePath("/dashboard/hr");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not submit leave request." };
  }
}

export async function decideLeaveRequestAction(leaveRequestId: string, status: LeaveRequestStatus): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };
  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  if (membership.role !== "OWNER" && membership.role !== "ADMIN") return { ok: false, error: "Only owners/admins can decide leave requests." };

  try {
    await decideLeaveRequest(leaveRequestId, membership.organizationId, status, userId);
    revalidatePath("/dashboard/hr");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not decide leave request." };
  }
}
