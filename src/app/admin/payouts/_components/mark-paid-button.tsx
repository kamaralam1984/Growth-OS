"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { markPayoutPaidAction } from "../actions";

export function MarkPaidButton({ payoutId }: { payoutId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm("Mark this payout as paid? Only do this after actually sending the funds.")) return;
    startTransition(async () => {
      const result = await markPayoutPaidAction(payoutId);
      if (!result.ok) {
        toast.error(result.error ?? "Could not mark this payout paid.");
        return;
      }
      toast.success("Payout marked paid.");
      router.refresh();
    });
  }

  return (
    <Button type="button" size="sm" variant="outline" onClick={handleClick} disabled={pending}>
      {pending ? "Saving..." : "Mark paid"}
    </Button>
  );
}
