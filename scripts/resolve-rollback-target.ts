/**
 * Real, read-only rollback-target resolver — invoked from
 * .github/workflows/deploy.yml's `rollback` job. Queries the real
 * Deployment table (via src/lib/ops/deployment.ts's planRollback) for the
 * most recent SUCCEEDED deployment in the target environment, given the
 * deployment currently considered bad/failing.
 *
 * This genuinely reads real data and prints a real answer — it does NOT
 * redeploy anything or write a new Deployment row. Actually redeploying the
 * resolved commit to a live host, and then calling recordRollbackStart to
 * record the rollback as a new Deployment row (rollbackOfId set), stays a
 * documented next step blocked on real hosting credentials (see
 * src/lib/ops/deployment.ts's recordRollbackStart and deploy.yml's
 * `rollback` job, which is `if: false`-gated for exactly this reason).
 *
 * Usage:
 *   tsx scripts/resolve-rollback-target.ts <targetDeploymentId>
 *   tsx scripts/resolve-rollback-target.ts --environment <STAGING|PRODUCTION>
 *
 * The second form resolves the target implicitly as "whatever is the most
 * recently started Deployment in this environment" (typically the one the
 * operator is trying to roll back away from) rather than requiring the
 * caller to already know its id.
 *
 * Exits 1 (not an error — a genuine "nothing to roll back to") if the given
 * deployment doesn't exist, the environment has no deployments at all, or no
 * earlier SUCCEEDED deployment is on file for its environment.
 */
import { getLatestDeployment, planRollback } from "@/lib/ops/deployment";
import type { DeploymentEnvironment } from "@/generated/prisma/client";

async function resolveTargetId(args: string[]): Promise<string> {
  if (args[0] === "--environment") {
    const environment = args[1]?.toUpperCase() as DeploymentEnvironment | undefined;
    if (!environment) {
      console.error("[resolve-rollback-target] --environment requires a value (STAGING|PRODUCTION|DEVELOPMENT).");
      process.exit(1);
    }
    const latest = await getLatestDeployment(environment);
    if (!latest) {
      console.error(`[resolve-rollback-target] No deployments on file at all for environment=${environment}.`);
      process.exit(1);
    }
    return latest.id;
  }

  const targetDeploymentId = args[0];
  if (!targetDeploymentId) {
    console.error(
      "[resolve-rollback-target] Usage:\n" +
        "  tsx scripts/resolve-rollback-target.ts <targetDeploymentId>\n" +
        "  tsx scripts/resolve-rollback-target.ts --environment <STAGING|PRODUCTION>",
    );
    process.exit(1);
  }
  return targetDeploymentId;
}

async function main(): Promise<void> {
  const targetDeploymentId = await resolveTargetId(process.argv.slice(2));

  const plan = await planRollback(targetDeploymentId);
  if (!plan) {
    console.error(
      `[resolve-rollback-target] No known-good deployment found to roll back to for Deployment ${targetDeploymentId} ` +
        "(either it doesn't exist, or no earlier SUCCEEDED deployment is on file for its environment).",
    );
    process.exit(1);
  }

  console.log(
    `[resolve-rollback-target] Would roll back Deployment ${plan.target.id} (${plan.target.environment}, ` +
      `commit ${plan.target.commitSha}) to Deployment ${plan.rollbackTo.id} ` +
      `(commit ${plan.rollbackTo.commitSha}, version ${plan.rollbackTo.version}, ` +
      `finished ${plan.rollbackTo.finishedAt?.toISOString() ?? "unknown"}).`,
  );
  console.log(`rollbackToDeploymentId=${plan.rollbackTo.id}`);
  console.log(`rollbackToCommitSha=${plan.rollbackTo.commitSha}`);
}

main()
  .catch((error) => {
    console.error("[resolve-rollback-target] unexpected error:", error);
    process.exit(1);
  })
  .finally(() => process.exit(process.exitCode ?? 0));
