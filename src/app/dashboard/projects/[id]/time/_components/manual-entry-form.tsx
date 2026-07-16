"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createManualTimeEntry } from "../actions";

export function ManualEntryForm({ projectId, tasks }: { projectId: string; tasks: Array<{ id: string; title: string }> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [taskId, setTaskId] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [billable, setBillable] = useState(true);
  const [note, setNote] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!date || !startTime || !endTime) {
      setError("Date, start time, and end time are required.");
      return;
    }
    const startedAt = new Date(`${date}T${startTime}`);
    const endedAt = new Date(`${date}T${endTime}`);
    startTransition(async () => {
      const result = await createManualTimeEntry(projectId, { taskId: taskId || undefined, startedAt, endedAt, billable, note: note || undefined });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setTaskId("");
      setDate("");
      setStartTime("");
      setEndTime("");
      setNote("");
      router.refresh();
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Log time manually
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Log time manually</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Task (optional)" htmlFor="manual-task" className="sm:col-span-2">
            <Select id="manual-task" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
              <option value="">No specific task</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Date" htmlFor="manual-date" required>
            <Input id="manual-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </FormField>
          <FormField label="Billable" htmlFor="manual-billable">
            <label className="flex h-11 items-center gap-1.5 text-sm text-foreground">
              <input id="manual-billable" type="checkbox" checked={billable} onChange={(e) => setBillable(e.target.checked)} />
              Billable
            </label>
          </FormField>
          <FormField label="Start time" htmlFor="manual-start" required>
            <Input id="manual-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
          </FormField>
          <FormField label="End time" htmlFor="manual-end" required>
            <Input id="manual-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
          </FormField>
          <FormField label="Note (optional)" htmlFor="manual-note" className="sm:col-span-2">
            <Input id="manual-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you work on?" />
          </FormField>

          {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}

          <div className="flex gap-3 sm:col-span-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save entry"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
