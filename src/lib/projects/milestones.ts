import { prisma } from "@/lib/prisma";

/** The brief's standard milestone set — seeded on every new project (manual or Deal-Won automation), editable/removable afterward. */
export const STANDARD_MILESTONE_NAMES = [
  "Planning",
  "Design",
  "Development",
  "Testing",
  "Deployment",
  "Training",
  "Go Live",
  "Completion",
] as const;

/** Idempotent — does nothing if this project already has milestones (e.g. re-triggered automation), never duplicates. */
export async function seedStandardMilestones(projectId: string): Promise<void> {
  const existing = await prisma.milestone.count({ where: { projectId } });
  if (existing > 0) return;

  await prisma.milestone.createMany({
    data: STANDARD_MILESTONE_NAMES.map((name, order) => ({
      projectId,
      name,
      order,
      visibleToClient: true,
    })),
  });
}
