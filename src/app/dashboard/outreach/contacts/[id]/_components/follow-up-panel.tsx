"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Compass, Clock, ListPlus } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AiErrorBanner, type AIErrorKind } from "@/app/board/_components/ai-error-banner";
import { getFollowUpSuggestion } from "@/app/dashboard/outreach/_lib/draft-actions";
import { createFollowUpTask } from "@/app/dashboard/outreach/_lib/crm-sync-actions";
import type { FollowUpSuggestion } from "@/lib/outreach/follow-up-engine";

const PRIORITY_VARIANT: Record<string, "outline" | "secondary" | "accent" | "default"> = {
  LOW: "outline",
  NORMAL: "secondary",
  HIGH: "accent",
  URGENT: "default",
};

export function FollowUpPanel({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [creatingTask, startCreateTask] = useTransition();
  const [suggestion, setSuggestion] = useState<FollowUpSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<AIErrorKind>(undefined);
  const [taskMessage, setTaskMessage] = useState<string | null>(null);

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      const result = await getFollowUpSuggestion(contactId);
      if (!result.ok || !result.suggestion) {
        setError(result.error ?? "Something went wrong.");
        setErrorKind(result.errorKind);
        return;
      }
      setSuggestion(result.suggestion);
    });
  }

  function handleCreateTask() {
    if (!suggestion) return;
    setTaskMessage(null);
    startCreateTask(async () => {
      const result = await createFollowUpTask(contactId, suggestion.recommendedNextStep);
      setTaskMessage(result.ok ? "Task created." : result.error ?? "Something went wrong.");
      if (result.ok) router.refresh();
    });
  }

  return (
    <Card glass>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Compass className="size-4 text-primary" /> Follow-up Engine <Badge variant="accent">AI Inference</Badge>
        </CardTitle>
        <Button size="sm" variant="outline" onClick={handleGenerate} disabled={pending}>
          {pending ? "Analyzing…" : suggestion ? "Refresh" : "Suggest follow-up"}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-0">
        {error && <AiErrorBanner error={error} kind={errorKind} />}
        {suggestion && (
          <>
            <div>
              <p className="text-xs font-semibold text-foreground">Conversation summary</p>
              <p className="mt-1 text-sm text-muted-foreground">{suggestion.conversationSummary}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">Recommended next step</p>
              <p className="mt-1 text-sm text-muted-foreground">{suggestion.recommendedNextStep}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={PRIORITY_VARIANT[suggestion.priority]}>{suggestion.priority} priority</Badge>
              {suggestion.suggestMeeting && <Badge variant="outline">Suggests requesting a meeting</Badge>}
            </div>
            <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Clock className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Best follow-up time: {suggestion.bestFollowUpTime}
                {!suggestion.bestFollowUpTimeIsReal && " (default — no engagement history yet)"}
              </span>
            </div>
            <Button size="sm" variant="outline" onClick={handleCreateTask} disabled={creatingTask} className="w-fit">
              <ListPlus className="size-3.5" /> {creatingTask ? "Creating…" : "Create task from this"}
            </Button>
            {taskMessage && <p className="text-xs text-primary">{taskMessage}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
