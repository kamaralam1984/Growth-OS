"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { createPromptAction } from "../_lib/actions";

export function PromptForm() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [title, setTitle] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [promptText, setPromptText] = React.useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const variables = Array.from(promptText.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)).map((m) => m[1]);
      const result = await createPromptAction({ title, category, promptText, variables: Array.from(new Set(variables)) });
      if (!result.ok) {
        toast.error(result.error ?? "Could not save the prompt.");
        return;
      }
      toast.success("Prompt saved.");
      setTitle("");
      setCategory("");
      setPromptText("");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> New prompt
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-md flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      <Input placeholder="Category (e.g. Sales, Email)" value={category} onChange={(e) => setCategory(e.target.value)} />
      <textarea
        placeholder="Prompt text — use {{variable}} tokens for placeholders"
        value={promptText}
        onChange={(e) => setPromptText(e.target.value)}
        className="min-h-28 rounded-lg border border-border bg-background px-3 py-2 text-sm"
        required
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save prompt"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
