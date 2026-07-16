import { Flame, Sun, Snowflake } from "lucide-react";

import { cn } from "@/lib/utils";
import type { LeadScoreBand } from "@/generated/prisma/client";

const BAND_STYLE: Record<LeadScoreBand, { label: string; icon: typeof Flame; className: string }> = {
  HOT: { label: "Hot", icon: Flame, className: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400" },
  WARM: { label: "Warm", icon: Sun, className: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  COLD: { label: "Cold", icon: Snowflake, className: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400" },
};

export interface LeadScoreBadgeProps {
  band: LeadScoreBand;
  score?: number;
  className?: string;
}

export function LeadScoreBadge({ band, score, className }: LeadScoreBadgeProps) {
  const { label, icon: Icon, className: bandClassName } = BAND_STYLE[band];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        bandClassName,
        className,
      )}
    >
      <Icon className="size-3" />
      {label}
      {typeof score === "number" && <span className="opacity-70">· {score}</span>}
    </span>
  );
}
