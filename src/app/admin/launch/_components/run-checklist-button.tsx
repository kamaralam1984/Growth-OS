"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { runLaunchChecklistAction } from "../actions";

export function RunChecklistButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleRun() {
    startTransition(async () => {
      const result = await runLaunchChecklistAction();
      if (!result.ok) {
        toast.error(result.error ?? "Could not run the checklist.");
        return;
      }
      toast.success("Launch checklist run recorded.");
      router.refresh();
    });
  }

  return (
    <Button size="sm" onClick={handleRun} disabled={pending}>
      <RefreshCw className={`size-3.5 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Running…" : "Run checklist"}
    </Button>
  );
}
