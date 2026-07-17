import { prisma } from "@/lib/prisma";
import type { Task } from "@/generated/prisma/client";

/** Real Task rows tagged to the hired Candidate via Task.relatedCandidateId — reuses the existing Task Board/notification/automation-trigger system instead of a parallel "OnboardingTask" model. */
const STANDARD_ONBOARDING_CHECKLIST = [
  "Send offer letter and collect signed copy",
  "Provision accounts and system access",
  "Schedule first-day orientation",
  "Assign onboarding buddy",
  "30-day check-in",
] as const;

export async function provisionOnboardingTasks(candidateId: string, organizationId: string, assignedByUserId?: string): Promise<Task[]> {
  const candidate = await prisma.candidate.findUnique({ where: { id: candidateId }, include: { jobOpening: true } });
  if (!candidate || candidate.organizationId !== organizationId) throw new Error("Candidate not found.");
  if (candidate.stage !== "HIRED") throw new Error("Onboarding tasks can only be created for a HIRED candidate.");

  const existing = await prisma.task.count({ where: { relatedCandidateId: candidateId } });
  if (existing > 0) return prisma.task.findMany({ where: { relatedCandidateId: candidateId } });

  return prisma.$transaction(
    STANDARD_ONBOARDING_CHECKLIST.map((title) =>
      prisma.task.create({
        data: {
          organizationId,
          title: `${title} — ${candidate.name}`,
          type: "APPROVAL",
          relatedCandidateId: candidateId,
          assignedByUserId: assignedByUserId ?? null,
        },
      }),
    ),
  );
}
