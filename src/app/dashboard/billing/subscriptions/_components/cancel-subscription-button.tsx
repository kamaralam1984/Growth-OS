"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cancelSubscription } from "../actions";

export function CancelSubscriptionButton({ subscriptionId, name }: { subscriptionId: string; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Cancel &ldquo;{name}&rdquo;?</span>
        <Button
          size="sm"
          variant="outline"
          className="border-destructive text-destructive hover:bg-destructive/10"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await cancelSubscription(subscriptionId);
              setConfirming(false);
              router.refresh();
            })
          }
        >
          {pending ? "Cancelling…" : "Confirm"}
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
          Back
        </Button>
      </div>
    );
  }

  return (
    <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
      <Ban className="size-4" /> Cancel
    </Button>
  );
}
