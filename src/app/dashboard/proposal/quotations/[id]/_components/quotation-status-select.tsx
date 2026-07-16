"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Select } from "@/components/ui/select";
import { updateQuotationStatus } from "../../../_lib/quotation-actions";
import type { QuotationStatusInput } from "@/lib/validations/documents";

const STATUSES: QuotationStatusInput[] = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"];

export function QuotationStatusSelect({ quotationId, status }: { quotationId: string; status: QuotationStatusInput }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Select
      value={status}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as QuotationStatusInput;
        startTransition(async () => {
          await updateQuotationStatus(quotationId, next);
          router.refresh();
        });
      }}
      className="h-11 w-36"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </Select>
  );
}
