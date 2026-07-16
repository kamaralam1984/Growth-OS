import { Radar, Gauge, Flame, Building2 } from "lucide-react";

import { AnimatedCounter } from "@/components/ui/animated-counter";
import type { ScanStats } from "@/lib/scanner/scan-analytics";

const ITEMS: Array<{ key: keyof ScanStats; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: "totalScans", label: "Total scans", icon: Radar },
  { key: "avgOpportunityScore", label: "Avg opportunity score", icon: Gauge },
  { key: "highValueOpportunities", label: "High-value opportunities", icon: Flame },
  { key: "industriesScanned", label: "Industries scanned", icon: Building2 },
];

export function ScanStatsStrip({ stats }: { stats: ScanStats }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
