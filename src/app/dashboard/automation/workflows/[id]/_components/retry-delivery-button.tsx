"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { retryWebhookDeliveryAction } from "../../../actions";

/**
 * Manual retry for a single failed OUTGOING WebhookDelivery — calls
 * retryWebhookDeliveryAction, which re-enqueues the delivery's real stored
 * payload against the webhook's real targetUrl through
 * src/lib/workflows/webhook-delivery-queue.ts. Only ever rendered for
 * failed OUTGOING rows by the caller (WebhookDeliveryLog) — this button has
 * no opinion of its own about eligibility.
 */
export function RetryDeliveryButton({ deliveryId }: { deliveryId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await retryWebhookDeliveryAction(deliveryId);
      if (!result.ok) {
        toast.error(result.error ?? "Something went wrong retrying the delivery.");
        return;
      }
      toast.success("Delivery re-queued for retry.");
      router.refresh();
    });
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleClick} disabled={isPending}>
      {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}
      Retry
    </Button>
  );
}
