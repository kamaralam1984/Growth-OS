"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { createTicketAction } from "../_lib/actions";
import type { MessagePriority } from "@/generated/prisma/client";

const PRIORITIES: MessagePriority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];

export function CreateTicketForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<MessagePriority>("NORMAL");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createTicketAction({ subject, description, priority });
      if (!result.ok) {
        toast.error(result.error ?? "Could not create ticket.");
        return;
      }
      toast.success("Ticket created.");
      if (result.taskId) router.push(`/dashboard/support/${result.taskId}`);
    });
  }

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> New ticket
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-lg flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} required />
      <textarea
        placeholder="Description..."
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="min-h-24 rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
      <Select value={priority} onChange={(e) => setPriority(e.target.value as MessagePriority)} className="w-32">
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </Select>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Creating…" : "Create ticket"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
