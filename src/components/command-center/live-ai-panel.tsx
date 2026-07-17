import Link from "next/link";
import {
  Crown,
  Megaphone,
  FileText,
  Send,
  TrendingUp,
  Target,
  DollarSign,
  Scale,
  Users,
  LifeBuoy,
  UserSearch,
  SearchCheck,
  PieChart,
  Microscope,
  HeartHandshake,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatusDot } from "@/app/board/_components/status-dot";
import type { AgentStatus, AgentType } from "@/generated/prisma/client";

export interface LiveAgentSummary {
  id: string;
  type: AgentType;
  name: string;
  active: boolean;
  status: AgentStatus;
  currentTask: string | null;
}

const AGENT_ICONS: Partial<Record<AgentType, React.ComponentType<{ className?: string }>>> = {
  CEO: Crown,
  SALES: TrendingUp,
  MARKETING: Megaphone,
  PROPOSAL: FileText,
  OUTREACH: Send,
  FINANCE: DollarSign,
  LEGAL: Scale,
  HR: Users,
  SUPPORT: LifeBuoy,
  RECRUITMENT: UserSearch,
  SEO: SearchCheck,
  BUSINESS_ANALYST: PieChart,
  RESEARCH: Microscope,
  CUSTOMER_SUCCESS: HeartHandshake,
};

const BUSY_STATUSES = new Set<AgentStatus>(["THINKING", "RESEARCHING", "PLANNING", "ANALYZING"]);

const STATUS_LABELS: Record<AgentStatus, string> = {
  IDLE: "Idle",
  THINKING: "Thinking…",
  RESEARCHING: "Researching…",
  PLANNING: "Planning…",
  ANALYZING: "Analyzing…",
  WAITING: "Waiting…",
  COMPLETED: "Completed",
};

/**
 * Condensed, real-time view of every AIAgentInstance in the org — a smaller
 * sibling of src/app/board/_components/agent-card.tsx for the Command
 * Center's right rail. No interactivity here (pause/resume/set-goal stay on
 * /board, which this links out to); this is a glanceable live status feed.
 */
export function LiveAIPanel({ agents }: { agents: LiveAgentSummary[] }) {
  return (
    <Card glass>
      <CardHeader>
        <CardTitle className="text-base">Live AI Workforce</CardTitle>
        <CardDescription>Real-time status of your executive agents.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {agents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No agents configured yet.</p>
        ) : (
          agents.map((agent) => {
            const Icon = AGENT_ICONS[agent.type] ?? Target;
            const isBusy = agent.active && BUSY_STATUSES.has(agent.status);
            return (
              <div key={agent.id} className="flex items-start gap-3 rounded-xl border border-border p-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <StatusDot active={isBusy} className="size-1.5" />
                    <p className="truncate text-sm font-medium text-foreground">{agent.name}</p>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {agent.active ? agent.currentTask || STATUS_LABELS[agent.status] : "Paused"}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <Link
          href="/board"
          className="mt-1 text-center text-xs font-medium text-primary underline-offset-4 hover:underline"
        >
          Open AI Executive Board
        </Link>
      </CardContent>
    </Card>
  );
}
