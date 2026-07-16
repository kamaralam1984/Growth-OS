"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, LifeBuoy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { postProjectComment, raiseTicket } from "../actions";
import { PortalRealtimeRefresher } from "./portal-realtime-refresher";

export interface PortalComment {
  id: string;
  content: string;
  authorName: string;
  createdAt: string;
}

export function CommentsPanel({ projectId, comments }: { projectId: string; comments: PortalComment[] }) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await postProjectComment(projectId, content);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setContent("");
      router.refresh();
    });
  }

  return (
    <Card glass>
      <PortalRealtimeRefresher projectId={projectId} />
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="size-4" /> Comments
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
        {comments.map((c) => (
          <div key={c.id} className="border-b border-border/60 pb-2 last:border-0">
            <p className="text-xs font-medium text-foreground">{c.authorName}</p>
            <p className="text-sm text-muted-foreground">{c.content}</p>
            <p className="text-[10px] text-muted-foreground">{new Date(c.createdAt).toLocaleString()}</p>
          </div>
        ))}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input value={content} onChange={(e) => setContent(e.target.value)} placeholder="Add a comment…" />
          <Button type="submit" size="sm" disabled={pending || !content.trim()}>
            Post
          </Button>
        </form>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

export function RaiseTicketPanel({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await raiseTicket(projectId, title, description);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setTitle("");
      setDescription("");
      setSuccess(true);
      router.refresh();
    });
  }

  return (
    <Card glass>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <LifeBuoy className="size-4" /> Raise a ticket
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What's the issue?" required />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Details (optional)"
            className="w-full resize-none rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          {success && <p className="text-xs text-primary">Ticket raised — your team has been notified.</p>}
          <Button type="submit" size="sm" disabled={pending || !title.trim()} className="w-fit">
            {pending ? "Submitting…" : "Submit ticket"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
