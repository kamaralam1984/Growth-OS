"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { transitionChangeRequestAction } from "../actions";

const NEXT_STEPS: Record<string, Array<{ status: string; label: string }>> = {
  PROPOSED: [
    { status: "APPROVED", label: "Approve" },
    { status: "REJECTED", label: "Reject" },
  ],
  APPROVED: [
    { status: "DEPLOYED", label: "Mark deployed" },
    { status: "REJECTED", label: "Reject" },
  ],
  DEPLOYED: [{ status: "ROLLED_BACK", label: "Roll back" }],
  REJECTED: [],
  ROLLED_BACK: [],
};

export function ChangeStatusControl({ changeId, status }: { changeId: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleTransition(next: string) {
    startTransition(async () => {
      const result = await transitionChangeRequestAction({ changeId, status: next });
      if (!result.ok) {
        toast.error(result.error ?? "Could not update change request.");
        return;
      }
      router.refresh();
    });
  }

  const options = NEXT_STEPS[status] ?? [];
  if (options.length === 0) return <span className="text-xs text-muted-foreground">No further action</span>;

  return (
    <div className="flex gap-2">
      {options.map((opt) => (
        <Button key={opt.status} size="sm" variant="outline" disabled={pending} onClick={() => handleTransition(opt.status)}>
          {opt.label}
        </Button>
      ))}
    </div>
  );
}
