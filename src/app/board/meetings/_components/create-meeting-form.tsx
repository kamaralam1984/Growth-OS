"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CreateMeetingInput } from "@/lib/validations/board";
import { createMeeting } from "../actions";

const EMPTY: CreateMeetingInput = { title: "", agenda: "" };

export function CreateMeetingForm() {
  const [form, setForm] = useState<CreateMeetingInput>(EMPTY);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof CreateMeetingInput>(key: K, value: CreateMeetingInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createMeeting(form);
      // A successful call redirects server-side and never returns here.
      if (!result.ok) {
        setError(result.error ?? "Something went wrong. Please try again.");
      }
    });
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>Start new meeting</Button>
    );
  }

  return (
    <Card glass>
      <CardHeader>
        <CardTitle>Start a new board meeting</CardTitle>
        <CardDescription>
          Your executive board (CEO, Sales, Marketing, Proposal, Outreach) will be seated automatically.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <FormField label="Title" htmlFor="meeting-title" required>
            <Input
              id="meeting-title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Q3 pipeline review"
              required
            />
          </FormField>
          <FormField label="Agenda" htmlFor="meeting-agenda" required>
            <textarea
              id="meeting-agenda"
              value={form.agenda}
              onChange={(e) => set("agenda", e.target.value)}
              placeholder="What should the board discuss and decide in this meeting?"
              required
              rows={4}
              className="w-full rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors duration-150 ease-[var(--ease-out-quad)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </FormField>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !form.title.trim() || !form.agenda.trim()}>
              {pending ? "Starting..." : "Start meeting"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
