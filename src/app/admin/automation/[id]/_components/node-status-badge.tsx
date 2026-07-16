import { CheckCircle2, XCircle, Clock, Loader2, Ban, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Mirrors get-latest-step-statuses.ts's LatestStepStatus shape exactly —
 * duplicated here (rather than imported) so this component stays a plain
 * client-safe leaf with no dependency on the server-only prisma lib file.
 */
export interface NodeRunStatus {
  status: string;
  finishedAt: Date | null;
  error: string | null;
}

/**
 * The prop canvas-node.tsx's WorkflowCanvasNodeData adopts to receive one
 * node's real, latest execution status.
 */
export interface NodeStatusOverlayProps {
  stepStatus?: NodeRunStatus;
}

interface StatusStyle {
  dot: string;
  ring: string;
  icon: LucideIcon;
  label: string;
  pulse?: boolean;
}

// This repo's status-badge convention (src/app/dashboard/automation/workflows/[id]/runs/page.tsx
// and runs/[runId]/page.tsx) maps WorkflowRunStatus -> Badge variant as
// QUEUED: outline, RUNNING: secondary, SUCCESS: accent, FAILED: default,
// CANCELLED: outline. SUCCESS/QUEUED/CANCELLED/RUNNING are reused here
// faithfully: "accent" and RUNNING's "secondary" both resolve to this app's
// real emerald/blue brand tokens (src/styles/tokens.css: --primary is
// emerald, --secondary is blue), which is exactly emerald-500/blue-500
// below. FAILED intentionally does NOT reuse that page's "default" variant:
// `default` resolves to bg-primary, i.e. the same emerald used for SUCCESS,
// so copying it verbatim would render a failed step in the same green
// family as a successful one. FAILED instead reuses this exact run-history
// page's OTHER real convention for errors — `text-red-500` on `run.error` —
// via this app's destructive token (--destructive is rose-500), the same
// token src/components/ui/alert.tsx's "destructive" variant already uses.
const STATUS_STYLES: Record<string, StatusStyle> = {
  QUEUED: { dot: "bg-muted-foreground", ring: "ring-muted-foreground/30", icon: Clock, label: "Queued" },
  RUNNING: { dot: "bg-blue-500", ring: "ring-blue-500/50", icon: Loader2, label: "Running", pulse: true },
  SUCCESS: { dot: "bg-emerald-500", ring: "ring-emerald-500/50", icon: CheckCircle2, label: "Success" },
  FAILED: { dot: "bg-destructive", ring: "ring-destructive/50", icon: XCircle, label: "Failed" },
  CANCELLED: { dot: "bg-muted-foreground", ring: "ring-muted-foreground/30", icon: Ban, label: "Cancelled" },
};

/**
 * A small colored dot/ring/icon overlay for one canvas node, reflecting that
 * node's real, latest WorkflowStepRun. Renders nothing when the step has
 * never run in the latest WorkflowRun — a genuine "no data" state.
 *
 * Expects to be placed inside a `relative`-positioned node card; positions
 * itself absolutely in that card's top-right corner.
 */
export function NodeStatusBadge({ stepStatus }: NodeStatusOverlayProps) {
  if (!stepStatus) return null;
  const style = STATUS_STYLES[stepStatus.status];
  if (!style) return null;
  const Icon = style.icon;

  return (
    <span
      className={cn(
        "absolute -top-1.5 -right-1.5 z-10 flex size-5 items-center justify-center rounded-full border-2 border-background ring-2",
        style.dot,
        style.ring,
      )}
      title={`${style.label}${stepStatus.error ? `: ${stepStatus.error}` : ""}`}
    >
      {style.pulse && (
        <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-75", style.dot)} />
      )}
      <Icon className={cn("relative size-3 text-white", style.pulse && "animate-spin")} />
    </span>
  );
}
