import { readFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/prisma";
import type { EnterpriseDocCategory, EnterpriseDocument } from "@/generated/prisma/client";

/**
 * Catalog of the real enterprise documentation this repo ships under
 * docs/ — every entry here is a real, existing Markdown file (verify with
 * `ls` before adding a new row; never register a path that doesn't exist).
 * `wordCount` is computed from the ACTUAL file contents at registration
 * time, not hardcoded, so the admin docs index (/admin/documentation)
 * honestly reflects the real current file, including after an edit.
 */
interface EnterpriseDocSeed {
  slug: string;
  title: string;
  category: EnterpriseDocCategory;
  filePath: string;
}

export const ENTERPRISE_DOC_CATALOG: EnterpriseDocSeed[] = [
  { slug: "architecture-guide", title: "Architecture Guide", category: "ARCHITECTURE", filePath: "docs/architecture/system-architecture.md" },
  { slug: "api-documentation", title: "API Documentation", category: "API", filePath: "docs/api/api-reference.md" },
  { slug: "developer-guide", title: "Developer Guide", category: "DEVELOPER", filePath: "docs/guides/developer-guide.md" },
  { slug: "administrator-guide", title: "Administrator Guide", category: "ADMINISTRATOR", filePath: "docs/guides/admin-manual.md" },
  { slug: "deployment-guide", title: "Deployment Guide", category: "DEPLOYMENT", filePath: "docs/guides/deployment-guide.md" },
  { slug: "disaster-recovery-guide", title: "Disaster Recovery Guide", category: "DISASTER_RECOVERY", filePath: "docs/operations/disaster-recovery.md" },
  { slug: "security-guide", title: "Security Guide", category: "SECURITY", filePath: "docs/guides/security-guide.md" },
  { slug: "compliance-guide", title: "Compliance Guide", category: "COMPLIANCE", filePath: "docs/guides/compliance-guide.md" },
  { slug: "marketplace-guide", title: "Marketplace Guide", category: "MARKETPLACE", filePath: "docs/guides/marketplace-guide.md" },
  { slug: "ai-agent-guide", title: "AI Agent Guide", category: "AI_AGENT", filePath: "docs/guides/ai-agent-guide.md" },
  { slug: "integration-guide", title: "Integration Guide", category: "INTEGRATION", filePath: "docs/guides/integration-guide.md" },
  { slug: "white-label-guide", title: "White Label Guide", category: "WHITE_LABEL", filePath: "docs/guides/white-label-guide.md" },
];

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Idempotent — safe to call on every admin docs-index page load. Skips (never fails the whole batch on) a doc whose file genuinely doesn't exist yet. */
export async function registerEnterpriseDocuments(generatedByUserId?: string): Promise<EnterpriseDocument[]> {
  const results: EnterpriseDocument[] = [];
  for (const doc of ENTERPRISE_DOC_CATALOG) {
    try {
      const raw = await readFile(path.join(process.cwd(), doc.filePath), "utf8");
      const wordCount = countWords(raw);
      const row = await prisma.enterpriseDocument.upsert({
        where: { slug: doc.slug },
        create: { slug: doc.slug, title: doc.title, category: doc.category, filePath: doc.filePath, wordCount, generatedByUserId, lastGeneratedAt: new Date() },
        update: { title: doc.title, category: doc.category, wordCount, lastGeneratedAt: new Date() },
      });
      results.push(row);
    } catch (error) {
      console.error(`[enterprise-docs] Could not read ${doc.filePath}, skipping registration:`, error);
    }
  }
  return results;
}

export async function listEnterpriseDocuments(): Promise<EnterpriseDocument[]> {
  return prisma.enterpriseDocument.findMany({ orderBy: { category: "asc" } });
}
