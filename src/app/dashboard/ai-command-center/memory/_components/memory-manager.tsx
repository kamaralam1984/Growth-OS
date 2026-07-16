"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AddMemoryForm } from "./add-memory-form";
import { MemoryList } from "./memory-list";
import { MemoryTimeline } from "./memory-timeline";

export interface AgentOption {
  id: string;
  name: string;
  type: string;
}

export interface MemoryRow {
  id: string;
  agentId: string;
  agentName: string;
  agentType: string;
  type: "PREFERENCE" | "GOAL" | "PAST_DECISION" | "MEETING_NOTE" | "CLIENT_CONTEXT" | "KNOWLEDGE" | "TASK";
  content: string;
  pinned: boolean;
  archived: boolean;
  sourceKind: "MEETING" | "DEAL" | "PROPOSAL" | "PROJECT" | "TASK" | "MANUAL" | null;
  sourceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TimelineRow {
  id: string;
  memoryId: string | null;
  agentName: string;
  eventType: "CREATED" | "EDITED" | "PINNED" | "UNPINNED" | "ARCHIVED" | "RESTORED" | "DELETED";
  contentSnapshot: string | null;
  createdAt: string;
}

export interface MemoryManagerProps {
  agents: AgentOption[];
  initialMemories: MemoryRow[];
  initialTimeline: TimelineRow[];
  canManage: boolean;
}

/**
 * Client shell tying the manual "Add memory" form, the filterable memory
 * list (Pin/Archive/Delete/Edit), and the Memory Timeline together under
 * tabs — mirrors this app's existing pattern (e.g. SecretsManager) of
 * rendering server-fetched `initial*` props directly and refreshing via
 * router.refresh() after a mutation, rather than keeping a separate
 * client-side copy that could drift from what the server actually holds.
 */
export function MemoryManager({ agents, initialMemories, initialTimeline, canManage }: MemoryManagerProps) {
  return (
    <div className="flex flex-col gap-6">
      <Card glass>
        <CardHeader>
          <CardTitle>Add memory manually</CardTitle>
          <CardDescription>Any active member can add a memory directly to an agent — tagged as a manual entry.</CardDescription>
        </CardHeader>
        <CardContent>
          <AddMemoryForm agents={agents} />
        </CardContent>
      </Card>

      <Tabs defaultValue="memories">
        <TabsList>
          <TabsTrigger value="memories">Memories</TabsTrigger>
          <TabsTrigger value="timeline">Memory Timeline</TabsTrigger>
        </TabsList>
        <TabsContent value="memories">
          <Card glass>
            <CardHeader>
              <CardTitle>Agent memories</CardTitle>
              <CardDescription>
                {canManage
                  ? "Pinned memories surface first and are prioritized in every agent's real prompt context."
                  : "Read-only — pinning, archiving, editing, and deleting memory is restricted to owners and admins."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MemoryList agents={agents} memories={initialMemories} canManage={canManage} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="timeline">
          <Card glass>
            <CardHeader>
              <CardTitle>Memory Timeline</CardTitle>
              <CardDescription>Every real state change to every memory in this organization, newest first.</CardDescription>
            </CardHeader>
            <CardContent>
              <MemoryTimeline events={initialTimeline} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
