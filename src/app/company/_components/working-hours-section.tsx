"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WEEKDAYS, type WorkingHoursInput, type Weekday } from "@/lib/validations/company";
import { updateWorkingHours } from "../actions";

export interface WorkingHoursSectionProps {
  orgId: string;
  canEdit: boolean;
  initial: WorkingHoursInput;
}

const DAY_LABELS: Record<Weekday, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

export function WorkingHoursSection({ orgId, canEdit, initial }: WorkingHoursSectionProps) {
  const [hours, setHours] = useState<WorkingHoursInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function updateDay(day: Weekday, patch: Partial<WorkingHoursInput[Weekday]>) {
    setHours((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));
    setSuccess(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await updateWorkingHours(orgId, hours);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSuccess(true);
    });
  }

  if (!canEdit) {
    return (
      <Card glass>
        <CardHeader>
          <CardTitle>Working hours</CardTitle>
          <CardDescription>When your team is available.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-1.5 text-sm">
            {WEEKDAYS.map((day) => (
              <li key={day} className="flex items-center justify-between border-b border-border/60 py-1.5 last:border-none">
                <span className="text-foreground">{DAY_LABELS[day]}</span>
                <span className="text-muted-foreground">
                  {hours[day]?.closed ? "Closed" : `${hours[day]?.open || "—"} – ${hours[day]?.close || "—"}`}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card glass>
      <CardHeader>
        <CardTitle>Working hours</CardTitle>
        <CardDescription>When your team is available — shown to clients and used by your agents.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {WEEKDAYS.map((day) => {
            const value = hours[day] ?? { closed: false, open: "", close: "" };
            return (
              <div
                key={day}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3"
              >
                <span className="w-28 shrink-0 text-sm font-medium text-foreground">{DAY_LABELS[day]}</span>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={value.closed}
                    onChange={(e) => updateDay(day, { closed: e.target.checked })}
                    className="size-4 rounded border-border accent-[var(--primary)]"
                  />
                  Closed
                </label>
                {!value.closed && (
                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    <Input
                      type="time"
                      value={value.open ?? ""}
                      onChange={(e) => updateDay(day, { open: e.target.value })}
                      className="w-auto"
                      aria-label={`${DAY_LABELS[day]} opening time`}
                    />
                    <span className="text-muted-foreground">to</span>
                    <Input
                      type="time"
                      value={value.close ?? ""}
                      onChange={(e) => updateDay(day, { close: e.target.value })}
                      className="w-auto"
                      aria-label={`${DAY_LABELS[day]} closing time`}
                    />
                  </div>
                )}
              </div>
            );
          })}

          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-primary">Saved.</p>}

          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
