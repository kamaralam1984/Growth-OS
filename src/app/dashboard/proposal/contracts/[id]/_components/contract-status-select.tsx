"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Select } from "@/components/ui/select";
import { updateContractStatus } from "../../../_lib/contract-actions";
import type { ContractStatusInput } from "@/lib/validations/documents";

const STATUSES: ContractStatusInput[] = ["DRAFT", "SENT", "SIGNED", "REJECTED", "EXPIRED", "ARCHIVED"];

export function ContractStatusSelect({ contractId, status }: { contractId: string; status: ContractStatusInput }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Select
      value={status}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as ContractStatusInput;
        startTransition(async () => {
          await updateContractStatus(contractId, next);
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
