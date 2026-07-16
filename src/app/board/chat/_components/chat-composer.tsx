"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { AiErrorBanner } from "@/app/board/_components/ai-error-banner";
import type { MessagePriority } from "@/generated/prisma/client";
import { sendAgentMessage } from "../actions";

export interface ChatAgentOption {
  id: string;
  name: string;
}

const PRIORITIES: MessagePriority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];

export function ChatComposer({ agents }: { agents: ChatAgentOption[] }) {
  const [receiverAgentId, setReceiverAgentId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [priority, setPriority] = useState<MessagePriority>("NORMAL");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<string | undefined>(undefined);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replyErrorKind, setReplyErrorKind] = useState<string | undefined>(undefined);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setErrorKind(undefined);
    setReplyError(null);
    setReplyErrorKind(undefined);
    startTransition(async () => {
      const result = await sendAgentMessage({
        receiverAgentId: receiverAgentId || undefined,
        reason,
        priority,
        content,
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        setErrorKind(result.errorKind);
        return;
      }
      if (result.replyError) {
        setReplyError(result.replyError);
        setReplyErrorKind(result.replyErrorKind);
      }
      setReason("");
      setContent("");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl border border-border bg-card/40 p-4 sm:p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Send to" htmlFor="chat-receiver" required>
          <Select id="chat-receiver" value={receiverAgentId} onChange={(e) => setReceiverAgentId(e.target.value)}>
            <option value="">Whole board (broadcast)</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Priority" htmlFor="chat-priority" required>
          <Select id="chat-priority" value={priority} onChange={(e) => setPriority(e.target.value as MessagePriority)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      <FormField label="Reason" htmlFor="chat-reason" required>
        <Input
          id="chat-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why are you reaching out?"
          required
        />
      </FormField>

      <FormField label="Message" htmlFor="chat-content" required>
        <textarea
          id="chat-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          placeholder="Write your message..."
          required
          className="w-full resize-none rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </FormField>

      {error && <AiErrorBanner error={error} kind={errorKind as "not_connected" | "billing" | "generic" | undefined} />}
      {replyError && (
        <AiErrorBanner
          error={`Your message was sent, but the agent's reply failed: ${replyError}`}
          kind={replyErrorKind as "not_connected" | "billing" | "generic" | undefined}
        />
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !reason.trim() || !content.trim()}>
          {pending ? "Sending..." : receiverAgentId ? "Send & request reply" : "Broadcast to board"}
        </Button>
      </div>
    </form>
  );
}
