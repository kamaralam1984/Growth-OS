"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Bell } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createReminder } from "../_lib/reminder-actions";

export function ReminderForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [remindAt, setRemindAt] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createReminder({ title, remindAt: new Date(remindAt) });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setTitle("");
      setRemindAt("");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Bell className="size-4" /> New Reminder
      </Button>
    );
  }

  return (
    <Card glass className="w-full">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>New reminder</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Close">
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Title" htmlFor="reminder-title" required className="sm:col-span-2">
            <Input id="reminder-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </FormField>
          <FormField label="Remind at" htmlFor="reminder-at" required className="sm:col-span-2">
            <Input id="reminder-at" type="datetime-local" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} required />
          </FormField>

          {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}

          <div className="flex gap-3 sm:col-span-2">
            <Button type="submit" disabled={pending || !title.trim() || !remindAt}>
              <Plus className="size-4" />
              {pending ? "Saving…" : "Save reminder"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
