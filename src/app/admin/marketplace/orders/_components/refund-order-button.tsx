"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { refundMarketplaceOrderAction } from "../actions";

export function RefundOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleRefund() {
    if (!confirm("Refund this order? This reverses the real payment, voids the publisher commission, and uninstalls the listing.")) return;
    startTransition(async () => {
      const result = await refundMarketplaceOrderAction(orderId);
      if (!result.ok) {
        toast.error(result.error ?? "Refund failed.");
        return;
      }
      toast.success("Order refunded.");
      router.refresh();
    });
  }

  return (
    <Button type="button" size="sm" variant="outline" onClick={handleRefund} disabled={pending}>
      <Undo2 className="size-3.5" /> Refund
    </Button>
  );
}
