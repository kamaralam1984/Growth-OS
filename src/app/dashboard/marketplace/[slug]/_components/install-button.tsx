"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Download, Trash2, RotateCcw, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { purchaseListingAction, uninstallListingAction, retryInstallAction } from "../../_lib/checkout-actions";
import { confirmManualPaymentAction } from "../../_lib/checkout-actions";

export function InstallButton({
  listingId,
  isFree,
  installStatus,
  pendingManualOrderId,
}: {
  listingId: string;
  isFree: boolean;
  installStatus: "NONE" | "ACTIVE" | "FAILED";
  pendingManualOrderId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleInstall() {
    startTransition(async () => {
      const result = await purchaseListingAction(listingId);
      if (!result.ok) {
        toast.error(result.error ?? "Could not start install.");
        return;
      }
      if (result.checkoutUrl && !result.installId) {
        window.location.href = result.checkoutUrl;
        return;
      }
      toast.success("Installed.");
      router.refresh();
    });
  }

  function handleUninstall() {
    startTransition(async () => {
      const result = await uninstallListingAction(listingId);
      if (!result.ok) {
        toast.error(result.error ?? "Could not uninstall.");
        return;
      }
      toast.success("Uninstalled.");
      router.refresh();
    });
  }

  function handleRetry() {
    startTransition(async () => {
      const result = await retryInstallAction(listingId);
      if (!result.ok) {
        toast.error(result.error ?? "Retry failed.");
        return;
      }
      toast.success("Install retried.");
      router.refresh();
    });
  }

  function handleConfirmManualPayment() {
    if (!pendingManualOrderId) return;
    startTransition(async () => {
      const result = await confirmManualPaymentAction(pendingManualOrderId);
      if (!result.ok) {
        toast.error(result.error ?? "Could not confirm payment.");
        return;
      }
      toast.success("Payment confirmed — installed.");
      router.refresh();
    });
  }

  if (pendingManualOrderId) {
    return (
      <Button type="button" onClick={handleConfirmManualPayment} disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        Confirm bank transfer received
      </Button>
    );
  }

  if (installStatus === "ACTIVE") {
    return (
      <Button type="button" variant="outline" onClick={handleUninstall} disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
        Uninstall
      </Button>
    );
  }

  if (installStatus === "FAILED") {
    return (
      <Button type="button" onClick={handleRetry} disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
        Retry install
      </Button>
    );
  }

  return (
    <Button type="button" onClick={handleInstall} disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
      {isFree ? "Install" : "Buy & Install"}
    </Button>
  );
}
