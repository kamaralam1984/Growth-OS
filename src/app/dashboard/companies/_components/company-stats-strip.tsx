import { Building2, Flame, Flag, Globe2, MapPinned, DollarSign, Sparkles } from "lucide-react";

import { AnimatedCounter } from "@/components/ui/animated-counter";
import { formatCurrency } from "@/app/dashboard/_lib/format";
import type { CompanyStats } from "@/lib/lead-analytics";

const ITEMS: Array<{
  key: Exclude<keyof CompanyStats, "pipelineValue">;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: "companiesFound", label: "Companies found", icon: Building2 },
  { key: "qualifiedLeads", label: "Qualified leads", icon: Flame },
  { key: "highPriorityLeads", label: "High priority", icon: Flag },
  { key: "industriesCount", label: "Industries", icon: Sparkles },
  { key: "countriesCount", label: "Countries", icon: Globe2 },
  { key: "aiResearchCompleted", label: "AI research runs", icon: MapPinned },
];

export function CompanyStatsStrip({ stats, currency }: { stats: CompanyStats; currency?: string | null }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      <div className="glass-panel flex flex-col gap-1.5 rounded-xl p-3.5">
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <DollarSign className="size-3.5" /> Pipeline value
        </span>
        <span className="text-xl font-semibold tracking-tight text-foreground">
          {formatCurrency(stats.pipelineValue, currency)}
        </span>
      </div>
      {ITEMS.map(({ key, label, icon: Icon }) => (
        <div key={key} className="glass-panel flex flex-col gap-1.5 rounded-xl p-3.5">
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Icon className="size-3.5" /> {label}
          </span>
          <span className="text-xl font-semibold tracking-tight text-foreground">
            <AnimatedCounter value={stats[key]} />
          </span>
        </div>
      ))}
    </div>
  );
}
