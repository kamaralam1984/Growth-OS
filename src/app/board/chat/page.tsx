import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Container } from "@/components/ui/container";
import { EXECUTIVE_AGENT_TYPES } from "@/lib/ai/personas";

import { ChatComposer } from "./_components/chat-composer";
import { ChatThread, type ChatMessage } from "./_components/chat-thread";

export default async function ChatPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=%2Fboard%2Fchat");
  }
  const userId = session.user.id;

  const membership = await prisma.membership.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) {
    redirect("/onboarding");
  }
  const organizationId = membership.organizationId;

  const [messages, agents] = await Promise.all([
    prisma.agentConversation.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
      include: {
        senderAgent: { select: { id: true, name: true, type: true } },
        receiverAgent: { select: { id: true, name: true } },
      },
    }),
    prisma.aIAgentInstance.findMany({
      where: { organizationId, active: true, type: { in: EXECUTIVE_AGENT_TYPES } },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const byId = new Map<string, ChatMessage>();
  for (const message of messages) {
    byId.set(message.id, {
      id: message.id,
      reason: message.reason,
      priority: message.priority,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
      parentId: message.parentId,
      senderAgent: message.senderAgent,
      receiverAgent: message.receiverAgent,
      replies: [],
    });
  }
  const roots: ChatMessage[] = [];
  for (const message of byId.values()) {
    if (message.parentId && byId.has(message.parentId)) {
      byId.get(message.parentId)!.replies.push(message);
    } else {
      roots.push(message);
    }
  }
  roots.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <main className="min-h-svh bg-background py-12">
      <Container className="flex flex-col gap-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Inter-agent chat
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Message a specific executive agent (and get a genuine reply) or broadcast to the whole board.
          </p>
        </div>

        <ChatComposer agents={agents} />

        <ChatThread threads={roots} />
      </Container>
    </main>
  );
}
