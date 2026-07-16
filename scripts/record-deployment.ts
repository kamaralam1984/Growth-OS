/**
 * Real Deployment CLI wrapper — invoked directly from
 * .github/workflows/deploy.yml's build-and-deploy job against the target
 * environment's real DATABASE_URL (same "tsx script + DATABASE_URL in env"
 * pattern this repo already uses for scripts/run-backup.ts /
 * scripts/run-restore-test.ts).
 *
 * Every row this writes reflects a real CI outcome: `start` is called right
 * before the GHCR build/push begins, `succeeded` only after that image has
 * genuinely been pushed to ghcr.io (with the real image ref recorded in
 * `notes`), and `failed` on any real non-zero exit earlier in the job, with
 * the actual error captured as `notes`. Nothing here fabricates a "deployed"
 * result — see src/lib/ops/deployment.ts's top comment for the honest
 * boundary between "image published to GHCR" and "live on a real host."
 *
 * Usage:
 *   tsx scripts/record-deployment.ts start <environment> <commitSha> <version>
 *   tsx scripts/record-deployment.ts succeeded <deploymentId> [note]
 *   tsx scripts/record-deployment.ts failed <deploymentId> <error>
 *
 * `start` prints `deploymentId=<id>` to stdout so the calling workflow step
 * can capture it (e.g. into $GITHUB_OUTPUT) and pass it to the later
 * succeeded/failed call.
 */
import {
  recordDeploymentFailed,
  recordDeploymentStart,
  recordDeploymentSucceeded,
} from "@/lib/ops/deployment";
import type { DeploymentEnvironment } from "@/generated/prisma/client";

const VALID_ENVIRONMENTS: DeploymentEnvironment[] = ["DEVELOPMENT", "STAGING", "PRODUCTION"];

function usageError(message: string): never {
  console.error(`[record-deployment] ${message}`);
  console.error(
    "Usage:\n" +
      "  tsx scripts/record-deployment.ts start <environment> <commitSha> <version>\n" +
      "  tsx scripts/record-deployment.ts succeeded <deploymentId> [note]\n" +
      "  tsx scripts/record-deployment.ts failed <deploymentId> <error>",
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  switch (command) {
    case "start": {
      const [envArg, commitSha, version] = rest;
      const environment = envArg?.toUpperCase();
      if (!environment || !VALID_ENVIRONMENTS.includes(environment as DeploymentEnvironment)) {
        usageError(`environment must be one of ${VALID_ENVIRONMENTS.join(", ")} (got ${envArg ?? "<none>"}).`);
      }
      if (!commitSha || !version) usageError("commitSha and version are required.");

      const deployment = await recordDeploymentStart(environment as DeploymentEnvironment, commitSha, version);
      console.log(`[record-deployment] Deployment ${deployment.id} (${environment}) started.`);
      console.log(`deploymentId=${deployment.id}`);
      return;
    }

    case "succeeded": {
      const [deploymentId, note] = rest;
      if (!deploymentId) usageError("deploymentId is required.");

      const deployment = await recordDeploymentSucceeded(deploymentId, note);
      console.log(`[record-deployment] Deployment ${deployment.id} SUCCEEDED.`);
      return;
    }

    case "failed": {
      const [deploymentId, error] = rest;
      if (!deploymentId || !error) usageError("deploymentId and error are required.");

      const deployment = await recordDeploymentFailed(deploymentId, error);
      console.log(`[record-deployment] Deployment ${deployment.id} FAILED: ${error}`);
      return;
    }

    default:
      usageError(`unknown command "${command ?? "<none>"}".`);
  }
}

main()
  .catch((error) => {
    console.error("[record-deployment] unexpected error:", error);
    process.exit(1);
  })
  .finally(() => process.exit(process.exitCode ?? 0));
