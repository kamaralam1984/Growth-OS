"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquarePlus } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { logReply } from "@/app/dashboard/outreach/_lib/reply-actions";
import type { DraftChannel } from "@/generated/prisma/client";

export function LogReplyForm({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [content, setContent] = useState("");
  const [channel, setChannel] = useState<DraftChannel>("EMAIL");
  const [message, setMessage] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await logReply(contactId, content, channel);
      if (!result.ok) {
        setMessage(result.error ?? "Something went wrong.");
        return;
      }
      setMessage(result.sentiment ? `Logged — classified as ${result.sentiment.toLowerCase()}.` : "Logged.");
      setContent("");
      router.refresh();
    });
  }

  return (
    <Card glass>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquarePlus className="size-4" /> Log a reply
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Paste exactly what the prospect wrote back — this is a real, manual entry, never simulated.
          </p>
          <Select value={channel} onChange={(e) => setChannel(e.target.value as DraftChannel)} className="h-9 w-40 text-sm">
            <option value="EMAIL">Email</option>
            <option value="LINKEDIN">LinkedIn</option>
          </Select>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            placeholder="What did they actually say?"
            className="w-full rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {message && <p className="text-sm text-primary">{message}</p>}
          <div>
            <Button type="submit" size="sm" disabled={pending || !content.trim()}>
              {pending ? "Logging…" : "Log reply"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
