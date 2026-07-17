import { Badge } from "@/components/ui/badge";
import type { ClientHealthClassification } from "@/generated/prisma/client";

const CLASSIFICATION_LABEL: Record<ClientHealthClassification, string> = {
  HEALTHY: "Healthy",
  NEEDS_ATTENTION: "Needs Attention",
  HIGH_RISK: "High Risk",
};

const CLASSIFICATION_CLASS: Record<ClientHealthClassification, string> = {
  HEALTHY: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  NEEDS_ATTENTION: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  HIGH_RISK: "border-destructive/30 bg-destructive/10 text-destructive",
};

export function ClientHealthBadge({ classification }: { classification: ClientHealthClassification }) {
  return <Badge variant="outline" className={CLASSIFICATION_CLASS[classification]}>{CLASSIFICATION_LABEL[classification]}</Badge>;
}
