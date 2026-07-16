"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Bot } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toggleAgentActive } from "../actions";

export interface AgentRow {
  id: string;
  type: string;
  name: string;
  active: boolean;
}

export interface AiSettingsSectionProps {
  organizationName: string | null;
  agents: AgentRow[];
}

export function AiSettingsSection({ organizationName, agents: initial }: AiSettingsSectionProps) {
  const [agents, setAgents] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleToggle(agentId: string, next: boolean) {
    setError(null);
    setPendingId(agentId);
    startTransition(async () => {
      const result = await toggleAgentActive({ agentId, active: next });
      setPendingId(null);
      if (!result.ok) {
        setError(result.error ?? "Could not update this agent.");
        return;
      }
      setAgents((prev) => prev.map((a) => (a.id === agentId ? { ...a, active: next } : a)));
    });
  }

  if (agents.length === 0) {
    return (
      <Card glass>
        <CardHeader>
          <CardTitle>AI Settings</CardTitle>
          <CardDescription>Manage which of your AI agents are active.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-12 text-center">
            <Bot className="size-6 text-muted-foreground" />
            <p className="max-w-sm text-sm text-muted-foreground">
              Your AI workforce hasn&apos;t been provisioned yet — finish onboarding to create your 7 agents.
            </p>
            <Button asChild>
              <Link href="/onboarding">Go to onboarding</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card glass>
      <CardHeader>
        <CardTitle>AI Settings</CardTitle>
        <CardDescription>
          {organizationName ? `Agents running for ${organizationName}.` : "Manage which of your AI agents are active."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <ul className="flex flex-col gap-3">
          {agents.map((agent) => (
            <li
              key={agent.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-border p-4"
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{agent.name}</span>
                  <Badge variant="outline">{agent.type}</Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {agent.active ? "Active" : "Inactive"}
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={agent.active}
                disabled={pendingId === agent.id}
                onClick={() => handleToggle(agent.id, !agent.active)}
                className={`relative h-6 w-11 shrink-0 rounded-full border border-border transition-colors disabled:opacity-50 ${
                  agent.active ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`absolute top-0.5 size-5 rounded-full bg-background shadow-card transition-transform ${
                    agent.active ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
