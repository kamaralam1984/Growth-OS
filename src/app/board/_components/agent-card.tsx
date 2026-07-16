"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { Crown, Megaphone, FileText, Send, TrendingUp, Pause, Play, Target, DollarSign, Scale } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { glowPulse } from "@/animations";
import type { AgentStatus, AgentType } from "@/generated/prisma/client";
import { toggleAgentActive, setAgentGoal } from "../actions";

export interface BoardAgent {
  id: string;
  type: AgentType;
  name: string;
  active: boolean;
  status: AgentStatus;
  currentTask: string | null;
  currentGoal: string | null;
  activeWorkflow: string | null;
  confidenceScore: number | null;
  completedTasksCount: number;
}

const AGENT_ICONS: Partial<Record<AgentType, React.ComponentType<{ className?: string; strokeWidth?: number }>>> = {
  CEO: Crown,
  SALES: TrendingUp,
  MARKETING: Megaphone,
  PROPOSAL: FileText,
  OUTREACH: Send,
  FINANCE: DollarSign,
  LEGAL: Scale,
};

const BUSY_STATUSES = new Set<AgentStatus>(["THINKING", "RESEARCHING", "PLANNING", "ANALYZING"]);

const STATUS_LABELS: Record<AgentStatus, string> = {
  IDLE: "Idle",
  THINKING: "Thinking...",
  RESEARCHING: "Researching...",
  PLANNING: "Planning...",
  ANALYZING: "Analyzing...",
  WAITING: "Waiting...",
  COMPLETED: "Completed",
};

export function AgentCard({ agent }: { agent: BoardAgent }) {
  const [togglePending, startToggle] = useTransition();
  const [goalPending, startGoal] = useTransition();
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalDraft, setGoalDraft] = useState(agent.currentGoal ?? "");
  const [error, setError] = useState<string | null>(null);

  const Icon = AGENT_ICONS[agent.type] ?? Target;
  const isBusy = BUSY_STATUSES.has(agent.status);
  const confidencePct =
    agent.confidenceScore !== null ? Math.max(0, Math.min(100, Math.round(agent.confidenceScore))) : null;

  function handleToggle() {
    setError(null);
    startToggle(async () => {
      const result = await toggleAgentActive(agent.id);
      if (!result.ok) setError(result.error ?? "Something went wrong.");
    });
  }

  function handleGoalSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startGoal(async () => {
      const result = await setAgentGoal(agent.id, goalDraft);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setShowGoalForm(false);
    });
  }

  return (
    <Card glass className="flex flex-col">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="size-5.5" strokeWidth={2} />
          </span>
          <div>
            <p className="text-sm font-semibold tracking-tight text-foreground">{agent.name}</p>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              {isBusy ? (
                <motion.span
                  animate={glowPulse.animate}
                  className="size-2 rounded-full bg-primary shadow-glow-primary"
                />
              ) : (
                <span
                  className={`size-2 rounded-full ${agent.active ? "bg-primary/50" : "bg-muted-foreground/40"}`}
                />
              )}
              {agent.active ? STATUS_LABELS[agent.status] : "Paused"}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4">
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Current task</dt>
            <dd className="text-foreground">{agent.currentTask || "No active task"}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Goal</dt>
            <dd className="text-foreground">{agent.currentGoal || "No goal set"}</dd>
          </div>
          {agent.activeWorkflow && (
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Workflow</dt>
              <dd className="text-foreground">{agent.activeWorkflow}</dd>
            </div>
          )}
        </dl>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium uppercase tracking-wider text-muted-foreground">Confidence</span>
            <span className="text-foreground">{confidencePct !== null ? `${confidencePct}%` : "Not yet scored"}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            {confidencePct !== null && (
              <motion.div
                className="h-full rounded-full bg-primary"
                initial={{ width: 0 }}
                animate={{ width: `${confidencePct}%` }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              />
            )}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="font-medium uppercase tracking-wider text-muted-foreground">Performance</span>
          <span className="text-foreground">
            {agent.completedTasksCount} task{agent.completedTasksCount === 1 ? "" : "s"} completed
          </span>
        </div>

        {showGoalForm && (
          <form onSubmit={handleGoalSubmit} className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <textarea
              value={goalDraft}
              onChange={(e) => setGoalDraft(e.target.value)}
              rows={2}
              placeholder="What should this agent focus on?"
              className="w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" disabled={goalPending}>
                {goalPending ? "Saving..." : "Save goal"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowGoalForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="mt-auto flex items-center gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleToggle}
            disabled={togglePending}
            className="flex-1"
          >
            {agent.active ? <Pause className="size-4" /> : <Play className="size-4" />}
            {togglePending ? "Working..." : agent.active ? "Pause" : "Resume"}
          </Button>
          {!showGoalForm && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="flex-1"
              onClick={() => {
                setGoalDraft(agent.currentGoal ?? "");
                setShowGoalForm(true);
              }}
            >
              <Target className="size-4" />
              Set goal
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
