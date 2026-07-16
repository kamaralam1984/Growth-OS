"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Save } from "lucide-react";

import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { updateJobCronExpressionAction } from "../actions";

export interface CronEditorProps {
  jobKey: string;
  cronExpression: string;
}

/**
 * Inline cron-expression editor for a single job row. The Save button only
 * enables once the field actually differs from the last-saved value, and the
 * real validation error from cron-parser (surfaced through
 * updateJobCronExpressionAction) renders inline rather than a generic
 * failure toast, since the specific reason is always known by then.
 */
export function CronEditor({ jobKey, cronExpression }: CronEditorProps) {
  const router = useRouter();
  const [value, setValue] = useState(cronExpression);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const dirty = value.trim() !== cronExpression;

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateJobCronExpressionAction(jobKey, value.trim());
      if (!result.ok) {
        setError(result.error ?? "Could not update the cron expression.");
        toast.error(result.error ?? "Could not update the cron expression.");
        return;
      }
      toast.success("Cron expression updated — the running schedule was re-registered.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          disabled={isPending}
          spellCheck={false}
          className="h-8 w-40 px-2 font-mono text-xs"
          aria-label={`Cron expression for ${jobKey}`}
          aria-invalid={error ? true : undefined}
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || isPending}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
        >
          <Save className="size-3.5" /> {isPending ? "Saving..." : "Save"}
        </button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
