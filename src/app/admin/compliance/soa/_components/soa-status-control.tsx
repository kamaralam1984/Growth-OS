"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { updateSoAImplementationStatusAction } from "../actions";

const STATUS_OPTIONS = ["NOT_IMPLEMENTED", "PARTIALLY_IMPLEMENTED", "IMPLEMENTED", "NOT_APPLICABLE"] as const;

export function SoAStatusControl({ entryId, implementationStatus }: { entryId: string; implementationStatus: (typeof STATUS_OPTIONS)[number] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleChange(next: string) {
    startTransition(async () => {
      const result = await updateSoAImplementationStatusAction({ entryId, implementationStatus: next });
      if (!result.ok) {
        toast.error(result.error ?? "Could not update status.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <Select value={implementationStatus} disabled={pending} onChange={(e) => handleChange(e.target.value)} className="h-8 py-1 text-xs">
      {STATUS_OPTIONS.map((opt) => (
        <option key={opt} value={opt}>
          {opt.replace(/_/g, " ")}
        </option>
      ))}
    </Select>
  );
}
