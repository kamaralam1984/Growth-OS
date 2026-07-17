"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { updatePublisherStatusAction } from "../actions";

const STATUS_OPTIONS = ["PENDING", "APPROVED", "SUSPENDED", "REJECTED"] as const;

export function PublisherStatusSelect({ publisherId, status }: { publisherId: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleChange(next: string) {
    if (next === status) return;
    startTransition(async () => {
      const result = await updatePublisherStatusAction(publisherId, next);
      if (!result.ok) {
        toast.error(result.error ?? "Could not update publisher status.");
        return;
      }
      toast.success(`Publisher status set to ${next}.`);
      router.refresh();
    });
  }

  return (
    <Select value={status} disabled={pending} onChange={(e) => handleChange(e.target.value)} className="h-9 w-36">
      {STATUS_OPTIONS.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </Select>
  );
}
