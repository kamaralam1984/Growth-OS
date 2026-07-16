"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Select } from "@/components/ui/select";
import { updateBusinessDocumentStatus } from "../../../_lib/business-document-actions";
import type { BusinessDocumentStatusInput } from "@/lib/validations/documents";

const STATUSES: BusinessDocumentStatusInput[] = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "ARCHIVED"];

export function BusinessDocumentStatusSelect({ documentId, status }: { documentId: string; status: BusinessDocumentStatusInput }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Select
      value={status}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as BusinessDocumentStatusInput;
        startTransition(async () => {
          await updateBusinessDocumentStatus(documentId, next);
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
