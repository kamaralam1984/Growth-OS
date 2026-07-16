"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Pause, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { ConfirmActionDialog } from "./confirm-action-dialog";
import { cancelSubscriptionAction, pauseSubscriptionAction, resumeSubscriptionAction } from "../actions";
import type { BillingStatus } from "@/generated/prisma/client";

export interface SubscriptionActionsProps {
  status: BillingStatus;
  cancelAtPeriodEnd: boolean;
  canManage: boolean;
}

/** Cancel/Pause/Resume controls for an already-active gateway subscription — every one of these is consequential, so cancel and pause go through a real confirmation dialog (see ConfirmActionDialog); resume doesn't need one since it only restores access. */
export function SubscriptionActions({ status, cancelAtPeriodEnd, canManage }: SubscriptionActionsProps) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!canManage) return null;
  if (status === "CANCELED") return null;

  function handleResume() {
    startTransition(async () => {
      const result = await resumeSubscriptionAction();
      if (!result.ok) {
        toast.error(result.error ?? "Could not resume the subscription.");
        return;
      }
      toast.success("Subscription resumed.");
      router.refresh();
    });
  }

  async function handleResumeRenewal() {
    return resumeSubscriptionAction();
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status === "PAUSED" ? (
        <Button type="button" size="sm" onClick={handleResume} disabled={pending}>
          <Play className="size-4" /> {pending ? "Resuming..." : "Resume subscription"}
        </Button>
      ) : (
        <ConfirmActionDialog
          trigger={
            <Button type="button" size="sm" variant="outline">
              <Pause className="size-4" /> Pause subscription
            </Button>
          }
          title="Pause your subscription?"
          description="Pausing stops billing and access at your gateway until you resume. This is different from canceling — your plan and data are kept as-is."
          confirmLabel="Pause"
          successMessage="Subscription paused."
          destructive
          onConfirm={pauseSubscriptionAction}
        />
      )}

      {!cancelAtPeriodEnd ? (
        <ConfirmActionDialog
          trigger={
            <Button type="button" size="sm" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10">
              <Ban className="size-4" /> Cancel subscription
            </Button>
          }
          title="Cancel your subscription?"
          description="Your subscription will be canceled at the end of the current billing period — you keep access until then, and this can be undone by resuming before it ends."
          confirmLabel="Cancel at period end"
          successMessage="Your subscription will cancel at the end of the current period."
          destructive
          onConfirm={() => cancelSubscriptionAction(true)}
        />
      ) : (
        <ConfirmActionDialog
          trigger={
            <Button type="button" size="sm" variant="outline">
              Undo cancellation
            </Button>
          }
          title="Keep your subscription active?"
          description="This resumes the subscription so it renews as normal instead of canceling at the end of the current period."
          confirmLabel="Resume renewal"
          successMessage="Cancellation undone — your subscription will renew as normal."
          onConfirm={handleResumeRenewal}
        />
      )}
    </div>
  );
}
