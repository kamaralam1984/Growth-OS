"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { updateSalesInquiryStatusAction } from "../actions";

const STATUS_OPTIONS = ["NEW", "CONTACTED", "CLOSED"] as const;

export function SalesInquiryStatusSelect({ inquiryId, status }: { inquiryId: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleChange(next: string) {
    if (next === status) return;
    startTransition(async () => {
      const result = await updateSalesInquiryStatusAction(inquiryId, next);
      if (!result.ok) {
        toast.error(result.error ?? "Could not update inquiry status.");
        return;
      }
      toast.success(`Inquiry status set to ${next}.`);
      router.refresh();
    });
  }

  return (
    <Select value={status} disabled={pending} onChange={(e) => handleChange(e.target.value)} className="h-9 w-32">
      {STATUS_OPTIONS.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </Select>
  );
}
