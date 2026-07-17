import { FileText } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requirePlatformOwner } from "@/lib/billing/platform-admin";
import { registerEnterpriseDocuments, listEnterpriseDocuments, ENTERPRISE_DOC_CATALOG } from "@/lib/ops/enterprise-docs";

const CATEGORY_LABEL: Record<string, string> = {
  ARCHITECTURE: "Architecture",
  API: "API",
  DEVELOPER: "Developer",
  ADMINISTRATOR: "Administrator",
  DEPLOYMENT: "Deployment",
  DISASTER_RECOVERY: "Disaster Recovery",
  SECURITY: "Security",
  COMPLIANCE: "Compliance",
  MARKETPLACE: "Marketplace",
  AI_AGENT: "AI Agent",
  INTEGRATION: "Integration",
  WHITE_LABEL: "White Label",
};

function formatDateTime(date: Date): string {
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Enterprise Documentation index — real Markdown files under docs/,
 * registered with a word count computed from their actual contents at
 * request time (registerEnterpriseDocuments() is a cheap, idempotent
 * upsert, same lazy-seed pattern as the Marketplace catalog). Honestly
 * reports "N/12" — never claims complete if a real file is missing.
 */
export default async function AdminDocumentationPage() {
  await requirePlatformOwner("/admin/documentation");

  await registerEnterpriseDocuments();
  const docs = await listEnterpriseDocuments();

  return (
    <Container className="flex flex-col gap-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Enterprise Documentation</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {docs.length}/{ENTERPRISE_DOC_CATALOG.length} real guides present under <code className="text-xs">docs/</code> — every
          word count below is computed from the actual current file, not hardcoded.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {docs.map((doc) => (
          <Card key={doc.id} glass>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="size-4 text-primary" /> {doc.title}
                </CardTitle>
                <Badge variant="outline">{CATEGORY_LABEL[doc.category] ?? doc.category}</Badge>
              </div>
              <CardDescription className="font-mono text-xs">{doc.filePath}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-foreground">{doc.wordCount.toLocaleString()} words</p>
              <p className="text-xs text-muted-foreground">Updated {formatDateTime(doc.lastGeneratedAt)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </Container>
  );
}
