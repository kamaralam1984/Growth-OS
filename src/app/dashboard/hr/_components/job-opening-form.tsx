"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { createJobOpeningAction, generateJobDescriptionAction } from "../_lib/actions";

export function JobOpeningForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [aiPending, startAiTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [description, setDescription] = useState("");

  function handleGenerate() {
    if (!title.trim()) {
      toast.error("Enter a title first.");
      return;
    }
    startAiTransition(async () => {
      const result = await generateJobDescriptionAction(title, department);
      if (!result.ok) {
        toast.error(result.error ?? "Could not generate a description.");
        return;
      }
      setDescription(result.description ?? "");
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createJobOpeningAction({ title, department, description });
      if (!result.ok) {
        toast.error(result.error ?? "Could not create the job opening.");
        return;
      }
      toast.success("Job opening created.");
      setTitle("");
      setDepartment("");
      setDescription("");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> New job opening
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-lg flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      <Input placeholder="Department (optional)" value={department} onChange={(e) => setDepartment(e.target.value)} />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Description</span>
        <Button type="button" size="sm" variant="outline" onClick={handleGenerate} disabled={aiPending}>
          <Sparkles className="size-3.5" /> {aiPending ? "Drafting…" : "AI draft"}
        </Button>
      </div>
      <textarea
        placeholder="Responsibilities, requirements, success criteria..."
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="min-h-32 rounded-lg border border-border bg-background px-3 py-2 text-sm"
        required
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Creating…" : "Create job opening"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
