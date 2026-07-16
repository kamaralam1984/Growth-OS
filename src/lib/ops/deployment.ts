import { prisma } from "@/lib/prisma";
import type { Deployment, DeploymentEnvironment, Prisma } from "@/generated/prisma/client";

type DeploymentWithDeployer = Prisma.DeploymentGetPayload<{
  include: { deployedByUser: { select: { name: true; email: true } } };
}>;

/**
 * Real Deployment row lifecycle — called by scripts/record-deployment.ts,
 * which is in turn invoked directly from .github/workflows/deploy.yml's
 * build-and-deploy job (the same "tsx script with DATABASE_URL in env"
 * pattern this repo already uses for scripts/run-backup.ts).
 *
 * What's real today: every row here reflects a genuine GHCR image build and
 * push (see deploy.yml) — commitSha/version are the real git ref and image
 * tag actually pushed to ghcr.io, and status genuinely reflects that CI
 * job's real exit code. Nothing here fabricates a "deployed to production"
 * result.
 *
 * What's still a documented gap: this only tracks "we built and published a
 * deployable image." Actually rolling that image out to a live host (Vercel/
 * AWS/Fly/etc.) requires real hosting credentials that don't exist in this
 * environment — see the "Configure your real deployment target here" comment
 * in deploy.yml. Until that's wired up, SUCCEEDED means "image published to
 * GHCR," not "traffic is being served by this build."
 */

export async function recordDeploymentStart(
  environment: DeploymentEnvironment,
  commitSha: string,
  version: string,
  deployedByUserId?: string | null,
): Promise<Deployment> {
  return prisma.deployment.create({
    data: {
      environment,
      commitSha,
      version,
      status: "IN_PROGRESS",
      deployedByUserId: deployedByUserId ?? null,
    },
  });
}

export async function recordDeploymentSucceeded(deploymentId: string, notes?: string): Promise<Deployment> {
  return prisma.deployment.update({
    where: { id: deploymentId },
    data: { status: "SUCCEEDED", finishedAt: new Date(), notes: notes ?? undefined },
  });
}

export async function recordDeploymentFailed(deploymentId: string, error: string): Promise<Deployment> {
  return prisma.deployment.update({
    where: { id: deploymentId },
    data: { status: "FAILED", finishedAt: new Date(), notes: error },
  });
}

/** Recent deployments of any environment/status, newest first — for the Production Dashboard's deployment history table (mirrors listRecentBackups). */
export async function listRecentDeployments(limit = 20): Promise<DeploymentWithDeployer[]> {
  return prisma.deployment.findMany({
    orderBy: { startedAt: "desc" },
    take: limit,
    include: { deployedByUser: { select: { name: true, email: true } } },
  });
}

/**
 * Most recent SUCCEEDED deployment for an environment — the real "last
 * known-good build" a rollback would target. `excludeDeploymentId` lets a
 * caller ask "ignoring this specific (failing) row, what's the last good
 * one?" without it ever matching itself.
 */
export async function getLastSuccessfulDeployment(
  environment: DeploymentEnvironment,
  excludeDeploymentId?: string,
): Promise<Deployment | null> {
  return prisma.deployment.findFirst({
    where: {
      environment,
      status: "SUCCEEDED",
      ...(excludeDeploymentId ? { id: { not: excludeDeploymentId } } : {}),
    },
    orderBy: { finishedAt: "desc" },
  });
}

/** Most recent deployment of any status for an environment — used to resolve an implicit rollback target ("roll back whatever is currently deployed") when the caller doesn't name a specific Deployment id. */
export async function getLatestDeployment(environment: DeploymentEnvironment): Promise<Deployment | null> {
  return prisma.deployment.findFirst({
    where: { environment },
    orderBy: { startedAt: "desc" },
  });
}

export interface RollbackPlan {
  /** The deployment being considered for rollback (typically the current/failing one). */
  target: Deployment;
  /** The last known-good deployment in the same environment that a rollback would restore. */
  rollbackTo: Deployment;
}

/**
 * Real, read-only "what would we roll back to" query — given a target
 * Deployment id, finds the most recent SUCCEEDED Deployment in the same
 * environment (never the target itself) to roll back to. Returns null if
 * the target doesn't exist or there is no known-good deployment to fall
 * back to (e.g. the very first deployment to an environment failed).
 *
 * This does NOT create a Deployment row or redeploy anything — it's the
 * genuinely buildable half of rollback described in deploy.yml's `rollback`
 * job. Actually re-deploying `rollbackTo`'s commit to a live host, and then
 * calling recordRollbackStart below, is blocked on real hosting credentials.
 */
export async function planRollback(targetDeploymentId: string): Promise<RollbackPlan | null> {
  const target = await prisma.deployment.findUnique({ where: { id: targetDeploymentId } });
  if (!target) return null;

  const rollbackTo = await getLastSuccessfulDeployment(target.environment, target.id);
  if (!rollbackTo) return null;

  return { target, rollbackTo };
}

/**
 * Real row-creation half of a rollback: records a new Deployment row for
 * `rollbackTo`'s environment, chained to it via rollbackOfId, so the
 * Deployment table's rollback-chaining (Deployment.rollbackOfId /
 * `rolledBackBy`) is real and queryable end to end. Only meaningful to call
 * once an actual redeploy of `rollbackTo`'s commit against a live host has
 * genuinely happened — this repo has no hosting credentials configured, so
 * nothing in CI calls this today (see deploy.yml's rollback job, gated
 * `if: false`, for the documented next step).
 */
export async function recordRollbackStart(
  rollbackTo: Deployment,
  commitSha: string,
  version: string,
  deployedByUserId?: string | null,
): Promise<Deployment> {
  return prisma.deployment.create({
    data: {
      environment: rollbackTo.environment,
      commitSha,
      version,
      status: "IN_PROGRESS",
      rollbackOfId: rollbackTo.id,
      deployedByUserId: deployedByUserId ?? null,
    },
  });
}
