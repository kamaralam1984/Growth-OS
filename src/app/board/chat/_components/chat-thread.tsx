import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/utils";
import type { MessagePriority } from "@/generated/prisma/client";

export interface ChatMessage {
  id: string;
  reason: string;
  priority: MessagePriority;
  content: string;
  createdAt: string;
  parentId: string | null;
  senderAgent: { id: string; name: string; type: string };
  receiverAgent: { id: string; name: string } | null;
  replies: ChatMessage[];
}

const PRIORITY_VARIANT: Record<MessagePriority, "default" | "secondary" | "outline" | "accent"> = {
  LOW: "outline",
  NORMAL: "secondary",
  HIGH: "accent",
  URGENT: "default",
};

function MessageBubble({ message, depth }: { message: ChatMessage; depth: number }) {
  return (
    <div className={depth > 0 ? "ml-6 border-l border-border pl-4" : ""}>
      <div className="rounded-xl border border-border bg-card/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            {message.senderAgent.name}
            <span className="text-muted-foreground">→</span>
            {message.receiverAgent ? message.receiverAgent.name : "Whole board"}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={PRIORITY_VARIANT[message.priority]}>{message.priority}</Badge>
            <span className="text-xs text-muted-foreground">{formatRelativeTime(new Date(message.createdAt))}</span>
          </div>
        </div>
        <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{message.reason}</p>
        <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/90">{message.content}</p>
      </div>
      {message.replies.length > 0 && (
        <div className="mt-3 flex flex-col gap-3">
          {message.replies.map((reply) => (
            <MessageBubble key={reply.id} message={reply} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ChatThread({ threads }: { threads: ChatMessage[] }) {
  if (threads.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
        No inter-agent messages yet — send the first one below.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {threads.map((thread) => (
        <MessageBubble key={thread.id} message={thread} depth={0} />
      ))}
    </div>
  );
}
