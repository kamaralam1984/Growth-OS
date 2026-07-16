"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { editMemory } from "../actions";
import type { MemoryRow } from "./memory-manager";

export interface EditMemoryDialogProps {
  memory: MemoryRow | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Re-encrypts new content via editMemory, which itself logs an EDITED
 * AgentMemoryEvent with the OLD content as contentSnapshot and re-enqueues
 * the embedding — this component just collects the new text. The caller
 * must render this with `key={memory?.id ?? "none"}` (same convention as
 * CreateSecretForm in the Secrets Manager) so switching to a different
 * memory remounts fresh initial state instead of this component syncing
 * props into state via an effect.
 */
export function EditMemoryDialog({ memory, onOpenChange }: EditMemoryDialogProps) {
  const router = useRouter();
  const [content, setContent] = useState(memory?.content ?? "");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!memory || !content.trim()) return;
    startTransition(async () => {
      const result = await editMemory(memory.id, content);
      if (!result.ok) {
        toast.error(result.error ?? "Could not save this edit.");
        return;
      }
      toast.success("Memory updated.");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={memory !== null}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false);
      }}
    >
      {memory && (
        <DialogContent key={memory.id}>
          <DialogHeader>
            <DialogTitle>Edit memory</DialogTitle>
            <DialogDescription>
              {memory.agentName} · {memory.type.replaceAll("_", " ")}. Saving logs the previous content in the Memory
              Timeline and re-embeds the new content for semantic search.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              maxLength={4000}
              className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !content.trim()}>
                {pending ? "Saving..." : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}
