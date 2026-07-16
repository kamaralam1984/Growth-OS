"use client";

import { useState, useTransition } from "react";
import { Landmark } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "@/components/ui/toast";
import { requestManualPaymentAction } from "../actions";

/**
 * Bank Transfer / Manual payment flow — this only ever RECORDS the
 * organization's intent to pay (a PENDING PlatformPayment row) and shows
 * real instructions for reaching billing. It never marks the payment as
 * received itself; only a platform operator can do that once funds
 * actually clear (see requestManualPaymentAction's own doc comment).
 */
export function ManualPaymentDialog({ planId, planName }: { planId: string; planName: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [instructions, setInstructions] = useState<string | null>(null);

  function handleRequest() {
    startTransition(async () => {
      const result = await requestManualPaymentAction(planId);
      if (!result.ok) {
        toast.error(result.error ?? "Could not record the request.");
        return;
      }
      setInstructions(result.instructions ?? null);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setInstructions(null);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <Landmark className="size-4" /> Pay by bank transfer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pay for {planName} by bank transfer</DialogTitle>
          <DialogDescription>
            This records your request to pay by wire transfer. It does not activate the plan by itself — a platform
            operator confirms activation once the transfer clears.
          </DialogDescription>
        </DialogHeader>

        {instructions ? (
          <Alert variant="success">
            <AlertDescription>{instructions}</AlertDescription>
          </Alert>
        ) : (
          <DialogFooter>
            <Button type="button" onClick={handleRequest} disabled={pending}>
              {pending ? "Recording..." : "Request bank transfer instructions"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
