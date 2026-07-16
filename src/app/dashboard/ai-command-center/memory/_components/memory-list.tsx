"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { deleteMemory, setMemoryArchived, setMemoryPinned } from "../actions";
import { EditMemoryDialog } from "./edit-memory-dialog";
import type { AgentOption, MemoryRow } from "./memory-manager";

export interface MemoryListProps {
  agents: AgentOption[];
  memories: MemoryRow[];
  canManage: boolean;
}

const TYPE_FILTER_OPTIONS = [
  "PREFERENCE",
  "GOAL",
  "PAST_DECISION",
  "MEETING_NOTE",
  "CLIENT_CONTEXT",
  "KNOWLEDGE",
  "TASK",
] as const;

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Real AgentMemory rows for the org, decrypted server-side and passed down
 * as plain strings — filterable by agent/type, pinned surfaced first (the
 * server already orders pinned-desc/updatedAt-desc; client-side filtering
 * here never re-sorts, just narrows). Mutations are OWNER/ADMIN-only —
 * `canManage` hides the Pin/Archive/Delete/Edit controls entirely for
 * everyone else, matching the read-only enforcement already done server-side
 * in actions.ts.
 */
export function MemoryList({ agents, memories, canManage }: MemoryListProps) {
  const router = useRouter();
  const [agentFilter, setAgentFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [showArchived, setShowArchived] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingMemory, setEditingMemory] = useState<MemoryRow | null>(null);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    return memories.filter((m) => {
      if (!showArchived && m.archived) return false;
      if (agentFilter !== "ALL" && m.agentId !== agentFilter) return false;
      if (typeFilter !== "ALL" && m.type !== typeFilter) return false;
      return true;
    });
  }, [memories, agentFilter, typeFilter, showArchived]);

  function runAction(id: string, action: () => Promise<{ ok: boolean; error?: string }>, successMessage: string) {
    setBusyId(id);
    startTransition(async () => {
      const result = await action();
      setBusyId(null);
      if (!result.ok) {
        toast.error(result.error ?? "Something went wrong.");
        return;
      }
      toast.success(successMessage);
      router.refresh();
    });
  }

  function handleDelete(row: MemoryRow) {
    if (!confirm("Permanently delete this memory? This cannot be undone (the Memory Timeline will still record that it existed).")) return;
    runAction(row.id, () => deleteMemory(row.id), "Memory deleted.");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="filter-agent" className="text-xs font-medium text-muted-foreground">
            Agent
          </label>
          <Select id="filter-agent" value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)} className="h-9 w-48">
            <option value="ALL">All agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="filter-type" className="text-xs font-medium text-muted-foreground">
            Type
          </label>
          <Select id="filter-type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="h-9 w-48">
            <option value="ALL">All types</option>
            {TYPE_FILTER_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t.replaceAll("_", " ")}
              </option>
            ))}
          </Select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="size-4 rounded border-input" />
          Show archived
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No memories match these filters.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agent</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Content</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Updated</TableHead>
              {canManage && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((row) => (
              <TableRow key={row.id} className={row.archived ? "opacity-60" : undefined}>
                <TableCell className="font-medium text-foreground">{row.agentName}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline">{row.type.replaceAll("_", " ")}</Badge>
                    {row.pinned && <Badge variant="accent">Pinned</Badge>}
                    {row.archived && <Badge variant="secondary">Archived</Badge>}
                  </div>
                </TableCell>
                <TableCell className="max-w-md whitespace-pre-wrap text-muted-foreground">{row.content}</TableCell>
                <TableCell className="text-muted-foreground">{row.sourceKind ? row.sourceKind.replaceAll("_", " ") : "—"}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(row.updatedAt)}</TableCell>
                {canManage && (
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button type="button" variant="outline" size="sm" disabled={busyId === row.id} onClick={() => setEditingMemory(row)}>
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busyId === row.id}
                        onClick={() => runAction(row.id, () => setMemoryPinned(row.id, !row.pinned), row.pinned ? "Unpinned." : "Pinned.")}
                      >
                        {row.pinned ? "Unpin" : "Pin"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busyId === row.id}
                        onClick={() => runAction(row.id, () => setMemoryArchived(row.id, !row.archived), row.archived ? "Restored." : "Archived.")}
                      >
                        {row.archived ? "Restore" : "Archive"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busyId === row.id}
                        onClick={() => handleDelete(row)}
                        className="text-red-500 hover:bg-red-500/10"
                      >
                        {busyId === row.id ? "Working..." : "Delete"}
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <EditMemoryDialog key={editingMemory?.id ?? "none"} memory={editingMemory} onOpenChange={(open) => !open && setEditingMemory(null)} />
    </div>
  );
}
