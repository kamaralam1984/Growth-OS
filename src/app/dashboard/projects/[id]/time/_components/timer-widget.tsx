"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Square, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { startTimer, stopTimer } from "../actions";
import { IdleTracker } from "./idle-tracker";

/**
 * Idle nudging is honestly scoped to browser-tab-visibility, not real
 * OS-level idle detection (not feasible from a web app) — after this long
 * with the tab hidden while a timer runs, we show a "still working?" nudge.
 */
const IDLE_NUDGE_MS = 5 * 60 * 1000;

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

export interface RunningTimerEntry {
  id: string;
  startedAt: string;
  taskId: string | null;
  note: string | null;
  source: string;
}

export function TimerWidget({
  projectId,
  runningEntry,
  tasks,
}: {
  projectId: string;
  runningEntry: RunningTimerEntry | null;
  tasks: Array<{ id: string; title: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [taskId, setTaskId] = useState("");
  const [note, setNote] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [showIdleNudge, setShowIdleNudge] = useState(false);
  const hiddenSinceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!runningEntry) return;
    const startedAtMs = new Date(runningEntry.startedAt).getTime();
    const tick = () => setElapsed(Date.now() - startedAtMs);
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [runningEntry]);

  useEffect(() => {
    if (!runningEntry) return;
    function handleVisibilityChange() {
      if (document.hidden) {
        hiddenSinceRef.current = Date.now();
      } else if (hiddenSinceRef.current) {
        const wasHiddenFor = Date.now() - hiddenSinceRef.current;
        hiddenSinceRef.current = null;
        if (wasHiddenFor >= IDLE_NUDGE_MS) setShowIdleNudge(true);
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [runningEntry]);

  function handleStart(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await startTimer(projectId, { taskId: taskId || undefined, note: note || undefined, billable: true });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    });
  }

  function handleStop() {
    if (!runningEntry) return;
    setError(null);
    setShowIdleNudge(false);
    startTransition(async () => {
      const result = await stopTimer(runningEntry.id);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    });
  }

  const activeTask = runningEntry?.taskId ? tasks.find((t) => t.id === runningEntry.taskId) : null;

  return (
    <>
      {runningEntry && <IdleTracker entryId={runningEntry.id} entryStartedAt={runningEntry.startedAt} entrySource={runningEntry.source} />}
      <Card glass>
        <CardContent className="flex flex-col gap-3 p-5">
          {showIdleNudge && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="size-4 shrink-0" />
              You were away from this tab for a while — still working? Stop the timer if not.
              <button type="button" onClick={() => setShowIdleNudge(false)} className="ml-auto text-xs underline underline-offset-2">
                Dismiss
              </button>
            </div>
          )}

          {runningEntry ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-mono text-3xl font-semibold tabular-nums text-foreground">{formatElapsed(elapsed)}</p>
                <p className="text-xs text-muted-foreground">{activeTask ? `Tracking "${activeTask.title}"` : "Tracking (no task linked)"}</p>
              </div>
              <Button type="button" variant="outline" onClick={handleStop} disabled={pending} className="text-destructive">
                <Square className="size-4" /> Stop
              </Button>
            </div>
          ) : (
            <form onSubmit={handleStart} className="flex flex-wrap items-end gap-3">
              <div className="flex min-w-40 flex-1 flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="timer-task">
                  Task (optional)
                </label>
                <Select id="timer-task" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                  <option value="">No specific task</option>
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex min-w-40 flex-1 flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="timer-note">
                  Note (optional)
                </label>
                <Input id="timer-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What are you working on?" />
              </div>
              <Button type="submit" disabled={pending}>
                <Play className="size-4" /> Start timer
              </Button>
            </form>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </>
  );
}
