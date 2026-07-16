"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { requestPayoutAction } from "../actions";

export function RequestPayoutButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await requestPayoutAction();
      if (!result.ok) {
        toast.error(result.error ?? "Could not request a payout.");
        return;
      }
      toast.success("Payout request created — a platform operator will process it.");
      router.refresh();
    });
  }

  return (
    <Button type="button" onClick={handleClick} disabled={disabled || pending} size="sm">
      {pending ? "Requesting..." : "Request payout"}
    </Button>
  );
}
