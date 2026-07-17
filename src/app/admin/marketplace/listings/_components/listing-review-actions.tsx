"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CheckCircle2, XCircle, Ban } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { approveListingVersionAction, rejectListingAction, suspendListingAction } from "../actions";

export function ListingReviewActions({ listingId, draftVersionId, status }: { listingId: string; draftVersionId: string | null; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>, successMessage: string) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error ?? "Action failed.");
        return;
      }
      toast.success(successMessage);
      router.refresh();
    });
  }

  return (
    <div className="flex gap-2">
      {status === "IN_REVIEW" && draftVersionId && (
        <>
          <Button type="button" size="sm" onClick={() => run(() => approveListingVersionAction(listingId, draftVersionId), "Listing approved and published.")} disabled={pending}>
            <CheckCircle2 className="size-4" /> Approve
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => run(() => rejectListingAction(listingId), "Listing rejected.")} disabled={pending}>
            <XCircle className="size-4" /> Reject
          </Button>
        </>
      )}
      {status === "PUBLISHED" && (
        <Button type="button" size="sm" variant="outline" onClick={() => run(() => suspendListingAction(listingId), "Listing suspended.")} disabled={pending}>
          <Ban className="size-4" /> Suspend
        </Button>
      )}
    </div>
  );
}
