"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { installTemplateAction } from "../actions";

export function InstallTemplateButton({ templateId, templateName }: { templateId: string; templateName: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleInstall() {
    startTransition(async () => {
      const result = await installTemplateAction(templateId);
      if (!result.ok || !result.workflowId) {
        toast.error(result.error ?? "Could not install this template.");
        return;
      }
      toast.success(`"${templateName}" installed as a new draft workflow.`);
      router.push(`/dashboard/automation/workflows/${result.workflowId}`);
    });
  }

  return (
    <Button type="button" size="sm" onClick={handleInstall} disabled={pending}>
      <Download className="size-4" />
      {pending ? "Installing..." : "Install"}
    </Button>
  );
}
