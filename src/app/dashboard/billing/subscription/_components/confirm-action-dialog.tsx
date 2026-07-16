"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

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
import { toast } from "@/components/ui/toast";

export interface ConfirmActionResult {
  ok: boolean;
  error?: string;
}

export interface ConfirmActionDialogProps {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  successMessage: string;
  /** Renders the confirm button destructive (red) for cancel/downgrade-style actions. */
  destructive?: boolean;
  onConfirm: () => Promise<ConfirmActionResult>;
}

/**
 * Shared "are you sure" dialog for every consequential billing action
 * (downgrade, cancel, pause) — a real Radix dialog, never a bare
 * window.confirm(), matching the confirm-flow pattern established by
 * src/app/dashboard/automation/templates/_components/install-template-button.tsx's
 * sibling dialogs (see connect-api-key-dialog.tsx for the Dialog+useTransition
 * shape this mirrors).
 */
export function ConfirmActionDialog({
  trigger,
  title,
  description,
  confirmLabel,
  successMessage,
  destructive = false,
  onConfirm,
}: ConfirmActionDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleConfirm() {
    startTransition(async () => {
      const result = await onConfirm();
      if (!result.ok) {
        toast.error(result.error ?? "Something went wrong. Please try again.");
        return;
      }
      toast.success(successMessage);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Never mind
          </Button>
          <Button
            type="button"
            variant={destructive ? "outline" : "default"}
            className={destructive ? "border-destructive/40 text-destructive hover:bg-destructive/10" : undefined}
            onClick={handleConfirm}
            disabled={pending}
          >
            {pending ? "Working..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
