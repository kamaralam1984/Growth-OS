"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Pause, Square, ListPlus, Send, Link2, Mic } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { AiErrorBanner, type AIErrorKind } from "@/app/board/_components/ai-error-banner";
import { createTask } from "@/app/board/tasks/actions";
import {
  advanceMeeting,
  endMeeting,
  pauseMeeting,
  resumeMeeting,
  postMeetingMessage,
  linkMeetingLead,
  type ActionResult,
} from "../actions";

export interface OwnerControlsProps {
  meetingId: string;
  status: "SCHEDULED" | "LIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";
  agents: Array<{ id: string; name: string }>;
  users: Array<{ id: string; name: string | null }>;
  leads: Array<{ id: string; name: string; company: string | null }>;
  relatedLeadId: string | null;
}

type Panel = "task" | "ask" | "link" | null;

export function OwnerControls({ meetingId, status, agents, users, leads, relatedLeadId }: OwnerControlsProps) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>(null);
  const [pending, startTransition] = useTransition();
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);

  const isLive = status === "LIVE";
  const isPaused = status === "PAUSED";
  const isActive = isLive || isPaused;

  function run(action: string, fn: () => Promise<ActionResult>) {
    setBusyAction(action);
    setResult(null);
    startTransition(async () => {
      const res = await fn();
      setResult(res);
      if (res.ok) router.refresh();
    });
  }

  if (!isActive) return null;

  return (
    <div className="glass-panel-strong flex flex-col gap-3 rounded-2xl p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => run("round", () => advanceMeeting(meetingId))} disabled={pending || isPaused}>
          {pending && busyAction === "round" ? "Running round…" : "Run next round"}
        </Button>
        {isLive ? (
          <Button size="sm" variant="outline" onClick={() => run("pause", () => pauseMeeting(meetingId))} disabled={pending}>
            <Pause className="size-4" /> Pause
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => run("resume", () => resumeMeeting(meetingId))} disabled={pending}>
            <Play className="size-4" /> Resume
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => run("end", () => endMeeting(meetingId))} disabled={pending}>
          <Square className="size-4" /> Stop
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setPanel(panel === "task" ? null : "task")}>
          <ListPlus className="size-4" /> Assign task
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setPanel(panel === "ask" ? null : "ask")} disabled={isPaused}>
          <Send className="size-4" /> Ask a question
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setPanel(panel === "link" ? null : "link")}>
          <Link2 className="size-4" /> Link deal
        </Button>
        <Button size="sm" variant="ghost" disabled title="Voice discussion — coming soon">
          <Mic className="size-4" /> Voice Mode
        </Button>
      </div>

      {result && !result.ok && <AiErrorBanner error={result.error ?? "Something went wrong."} kind={result.errorKind as AIErrorKind} />}

      {panel === "task" && <AssignTaskPanel meetingId={meetingId} agents={agents} users={users} onDone={() => setPanel(null)} />}
      {panel === "ask" && <AskQuestionPanel meetingId={meetingId} onDone={() => setPanel(null)} />}
      {panel === "link" && (
        <LinkDealPanel meetingId={meetingId} leads={leads} relatedLeadId={relatedLeadId} onDone={() => setPanel(null)} />
      )}
    </div>
  );
}

function AssignTaskPanel({
  meetingId,
  agents,
  users,
  onDone,
}: {
  meetingId: string;
  agents: OwnerControlsProps["agents"];
  users: OwnerControlsProps["users"];
  onDone: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [assigneeKind, setAssigneeKind] = useState<"agent" | "user">("agent");
  const [assigneeId, setAssigneeId] = useState(agents[0]?.id ?? "");
  const [priority, setPriority] = useState<"LOW" | "NORMAL" | "HIGH" | "URGENT">("NORMAL");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const options = assigneeKind === "agent" ? agents.map((a) => ({ id: a.id, label: a.name })) : users.map((u) => ({ id: u.id, label: u.name ?? "Team member" }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!assigneeId) {
      setError("Choose someone to assign this task to.");
      return;
    }
    startTransition(async () => {
      const result = await createTask({
        title,
        meetingId,
        priority,
        assignedToAgentId: assigneeKind === "agent" ? assigneeId : undefined,
        assignedToUserId: assigneeKind === "user" ? assigneeId : undefined,
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
      onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 rounded-xl border border-border/60 p-3">
      <Input placeholder="Task title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      <div className="grid grid-cols-2 gap-2">
        <Select
          value={assigneeKind}
          onChange={(e) => {
            const kind = e.target.value as "agent" | "user";
            setAssigneeKind(kind);
            setAssigneeId(kind === "agent" ? agents[0]?.id ?? "" : users[0]?.id ?? "");
          }}
        >
          <option value="agent">AI agent</option>
          <option value="user">Team member</option>
        </Select>
        <Select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
          <option value="LOW">Low</option>
          <option value="NORMAL">Normal</option>
          <option value="HIGH">High</option>
          <option value="URGENT">Urgent</option>
        </Select>
      </div>
      <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
        {options.length === 0 && <option value="">None available</option>}
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </Select>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button type="submit" size="sm" disabled={pending || !title.trim() || !assigneeId}>
        {pending ? "Assigning…" : "Assign task"}
      </Button>
    </form>
  );
}

function AskQuestionPanel({ meetingId, onDone }: { meetingId: string; onDone: () => void }) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await postMeetingMessage(meetingId, content);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setContent("");
      router.refresh();
      onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 rounded-xl border border-border/60 p-3">
      <Input
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Ask the board a question or add a comment…"
        maxLength={4000}
      />
      <Button type="submit" size="sm" disabled={pending || !content.trim()}>
        {pending ? "Posting…" : "Post"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}

function LinkDealPanel({
  meetingId,
  leads,
  relatedLeadId,
  onDone,
}: {
  meetingId: string;
  leads: OwnerControlsProps["leads"];
  relatedLeadId: string | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [leadId, setLeadId] = useState(relatedLeadId ?? "");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      await linkMeetingLead(meetingId, leadId || null);
      router.refresh();
      onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 rounded-xl border border-border/60 p-3">
      <Select value={leadId} onChange={(e) => setLeadId(e.target.value)} className="flex-1">
        <option value="">Not linked</option>
        {leads.map((lead) => (
          <option key={lead.id} value={lead.id}>
            {lead.name}
            {lead.company ? ` (${lead.company})` : ""}
          </option>
        ))}
      </Select>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
