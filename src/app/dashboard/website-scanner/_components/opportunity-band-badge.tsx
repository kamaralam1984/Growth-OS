import { TrendingUp, Gauge, Minus } from "lucide-react";

import { cn } from "@/lib/utils";
import type { OpportunityBand } from "@/generated/prisma/client";

const BAND_STYLE: Record<OpportunityBand, { label: string; icon: typeof TrendingUp; className: string }> = {
  HIGH: { label: "High Opportunity", icon: TrendingUp, className: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400" },
  MEDIUM: { label: "Medium Opportunity", icon: Gauge, className: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  LOW: { label: "Low Opportunity", icon: Minus, className: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400" },
};

export function OpportunityBandBadge({ band, score, className }: { band: OpportunityBand; score?: number; className?: string }) {
  const { label, icon: Icon, className: bandClassName } = BAND_STYLE[band];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium", bandClassName, className)}>
      <Icon className="size-3" />
      {label}
      {typeof score === "number" && <span className="opacity-70">· {score}</span>}
    </span>
  );
}
