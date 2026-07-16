"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { regenerateComplianceReportAction } from "../actions";
import type { ComplianceFramework } from "@/generated/prisma/client";

export function RegenerateReportButton({ framework }: { framework: ComplianceFramework }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await regenerateComplianceReportAction(framework);
      if (!result.ok) {
        toast.error(result.error ?? "Could not generate this report.");
        return;
      }
      toast.success(`${framework} report regenerated.`);
      router.refresh();
    });
  }

  return (
    <Button type="button" onClick={handleClick} disabled={pending} variant="outline" size="sm">
      {pending ? "Generating…" : "Regenerate"}
    </Button>
  );
}
