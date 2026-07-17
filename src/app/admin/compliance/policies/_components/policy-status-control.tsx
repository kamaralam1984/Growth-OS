"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { transitionPolicyAction } from "../actions";

export function PolicyStatusControl({ policyId, status }: { policyId: string; status: "DRAFT" | "PUBLISHED" | "ARCHIVED" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleTransition(action: "publish" | "archive") {
    startTransition(async () => {
      const result = await transitionPolicyAction({ policyId, action });
      if (!result.ok) {
        toast.error(result.error ?? "Could not update policy.");
        return;
      }
      router.refresh();
    });
  }

  if (status === "ARCHIVED") return <span className="text-xs text-muted-foreground">Archived</span>;

  return (
    <div className="flex gap-2">
      {status === "DRAFT" && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => handleTransition("publish")}>
          Publish
        </Button>
      )}
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => handleTransition("archive")}>
        Archive
      </Button>
    </div>
  );
}
