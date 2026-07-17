"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Trash2, Copy } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { deletePromptAction } from "../_lib/actions";
import type { PromptTemplate } from "@/generated/prisma/client";

export function PromptList({ prompts }: { prompts: PromptTemplate[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deletePromptAction(id);
      if (!result.ok) {
        toast.error(result.error ?? "Could not delete prompt.");
        return;
      }
      toast.success("Prompt deleted.");
      router.refresh();
    });
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text).then(() => toast.success("Copied to clipboard."));
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {prompts.map((prompt) => (
        <Card key={prompt.id} glass>
          <CardContent className="flex flex-col gap-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium text-foreground">{prompt.title}</p>
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => handleCopy(prompt.promptText)} title="Copy">
                  <Copy className="size-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => handleDelete(prompt.id)} disabled={pending} title="Delete">
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {prompt.category && <Badge variant="outline">{prompt.category}</Badge>}
              {prompt.agentType && <Badge variant="secondary">{prompt.agentType}</Badge>}
              {prompt.sourceListingId && <Badge variant="accent">From Marketplace</Badge>}
            </div>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{prompt.promptText}</p>
            {prompt.variables.length > 0 && (
              <p className="text-xs text-muted-foreground">Variables: {prompt.variables.map((v) => `{{${v}}}`).join(", ")}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
