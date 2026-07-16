"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { becomePartnerAction } from "../actions";

export function ApplyPartnerForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleApply() {
    startTransition(async () => {
      const result = await becomePartnerAction();
      if (!result.ok) {
        toast.error(result.error ?? "Could not submit your partner application.");
        return;
      }
      toast.success("Application submitted — a platform operator will review it.");
      router.refresh();
    });
  }

  return (
    <Card glass className="max-w-xl">
      <CardHeader>
        <CardTitle>Become a partner</CardTitle>
        <CardDescription>
          Earn a real commission on every organization you refer to KVL GrowthOS. Once approved, you get a unique
          referral link, a live commissions ledger, and a payout request flow.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Applying creates your partner account with status <span className="font-medium text-foreground">PENDING</span>.
          A platform operator reviews and approves new partner applications manually — there&apos;s no self-service
          approval, so it may take a little while before your referral link starts earning commission.
        </p>
        <Button type="button" onClick={handleApply} disabled={pending} className="self-start">
          {pending ? "Submitting..." : "Apply to become a partner"}
        </Button>
      </CardContent>
    </Card>
  );
}
