import { createPromptTemplate } from "@/lib/prompt-library";
import { prisma } from "@/lib/prisma";
import type { PromptPackManifest } from "../manifest-schema";

export interface PromptPackInstallResult {
  promptTemplateIds: string[];
}

/** Calls the real createPromptTemplate() per manifest prompt, tagging sourceListingId for clean uninstall. */
export async function installPromptPack(
  organizationId: string,
  listingId: string,
  manifest: PromptPackManifest,
  createdByUserId: string,
): Promise<PromptPackInstallResult> {
  const created = await Promise.all(
    manifest.prompts.map((p) =>
      createPromptTemplate({
        organizationId,
        title: p.title,
        promptText: p.promptText,
        variables: p.variables,
        category: p.category ?? null,
        agentType: p.agentType ?? null,
        sourceListingId: listingId,
        createdByUserId,
      }),
    ),
  );

  return { promptTemplateIds: created.map((p) => p.id) };
}

export async function uninstallPromptPack(promptTemplateIds: string[]): Promise<void> {
  await prisma.promptTemplate.deleteMany({ where: { id: { in: promptTemplateIds } } });
}
