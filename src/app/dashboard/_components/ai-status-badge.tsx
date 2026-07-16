import { Bot, Plug, CreditCard } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AIConnectionStatus } from "@/lib/ai/status";

const STATUS_CONFIG: Record<AIConnectionStatus, { label: string; icon: typeof Bot; dim: boolean }> = {
  connected: { label: "AI Connected", icon: Bot, dim: false },
  no_credits: { label: "AI Connected — No Credits", icon: CreditCard, dim: true },
  not_connected: { label: "AI Not Connected", icon: Plug, dim: true },
};

/**
 * Real, server-computed AI status — rose/neutral only, deliberately not a
 * red/green traffic light (per the brief) even though "no_connected"/"no
 * credits" are degraded states.
 */
export function AiStatusBadge({ status }: { status: AIConnectionStatus }) {
  const { label, icon: Icon, dim } = STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        "hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium sm:inline-flex",
        dim ? "border-border text-muted-foreground" : "border-primary/20 bg-primary/10 text-primary",
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </span>
  );
}
