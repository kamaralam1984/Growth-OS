"use client";

import { useState, useTransition, type FormEvent } from "react";
import { MailPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { requestMoreAICreditsAction } from "../actions";

/**
 * A real "request more credits" affordance — not a fake instant-purchase
 * checkout. Submitting creates a real Notification for the org's
 * owners/admins plus a real AuditLog entry (requestMoreAICreditsAction);
 * there is no payment flow here.
 */
export function RequestCreditsForm({ organizationId }: { organizationId: string }) {
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await requestMoreAICreditsAction(organizationId, message.trim() || undefined);
      if (!result.ok) {
        toast.error(result.error ?? "Something went wrong sending the request.");
        return;
      }
      setSent(true);
      toast.success("Request sent to your organization's owners/admins.");
    });
  }

  if (sent) {
    return (
      <p className="text-sm text-muted-foreground">
        Your request has been sent to this organization&rsquo;s owners and admins as a real in-app notification.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Optional note — what you need more credits for (optional)"
        maxLength={500}
        className="sm:flex-1"
      />
      <Button type="submit" variant="secondary" disabled={isPending} className="shrink-0">
        <MailPlus className="size-4" />
        {isPending ? "Sending…" : "Request more credits"}
      </Button>
    </form>
  );
}
