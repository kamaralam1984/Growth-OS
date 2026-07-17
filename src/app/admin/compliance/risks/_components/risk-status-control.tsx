"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { updateSecurityRiskStatusAction } from "../actions";

const STATUS_OPTIONS = ["OPEN", "MITIGATING", "MITIGATED", "ACCEPTED"] as const;

export function RiskStatusControl({ riskId, status }: { riskId: string; status: (typeof STATUS_OPTIONS)[number] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleChange(next: string) {
    startTransition(async () => {
      const result = await updateSecurityRiskStatusAction({ riskId, status: next });
      if (!result.ok) {
        toast.error(result.error ?? "Could not update status.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <Select value={status} disabled={pending} onChange={(e) => handleChange(e.target.value)} className="h-8 py-1 text-xs">
      {STATUS_OPTIONS.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </Select>
  );
}
