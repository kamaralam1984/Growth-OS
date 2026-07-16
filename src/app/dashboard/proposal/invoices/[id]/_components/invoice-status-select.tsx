"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Select } from "@/components/ui/select";
import { updateInvoiceStatus } from "../../../_lib/invoice-actions";
import type { InvoiceStatusInput } from "@/lib/validations/documents";

const STATUSES: InvoiceStatusInput[] = ["DRAFT", "SENT", "PAID", "OVERDUE", "CANCELLED", "VOID"];

export function InvoiceStatusSelect({ invoiceId, status }: { invoiceId: string; status: InvoiceStatusInput }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Select
      value={status}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as InvoiceStatusInput;
        startTransition(async () => {
          await updateInvoiceStatus(invoiceId, next);
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
