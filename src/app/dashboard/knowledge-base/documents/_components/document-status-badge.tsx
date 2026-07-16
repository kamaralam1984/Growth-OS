import { Badge } from "@/components/ui/badge";
import type { IngestedDocumentStatus } from "@/generated/prisma/client";

/**
 * Distinct color per real ingestion phase (PENDING→PARSING→CHUNKING→EMBEDDING→READY,
 * or FAILED) — Badge itself only ships default/secondary/outline/accent
 * variants, so the extra color classes below borrow the same
 * emerald/amber/blue/violet/red palette src/components/ui/alert.tsx already
 * uses, rather than inventing a new one.
 */
const STATUS_STYLES: Record<IngestedDocumentStatus, string> = {
  PENDING: "border-border bg-muted text-muted-foreground",
  PARSING: "border-blue-500/30 bg-blue-500/10 text-blue-600",
  CHUNKING: "border-amber-500/30 bg-amber-500/10 text-amber-600",
  EMBEDDING: "border-violet-500/30 bg-violet-500/10 text-violet-600",
  READY: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
  FAILED: "border-red-500/30 bg-red-500/10 text-red-600",
};

export function DocumentStatusBadge({ status }: { status: IngestedDocumentStatus }) {
  return <Badge className={STATUS_STYLES[status]}>{status}</Badge>;
}

export const IN_FLIGHT_DOCUMENT_STATUSES = new Set<IngestedDocumentStatus>(["PENDING", "PARSING", "CHUNKING", "EMBEDDING"]);
