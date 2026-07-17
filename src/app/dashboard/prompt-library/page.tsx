import { Sparkles } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { requireActiveMembership } from "../_lib/require-membership";
import { listPromptTemplates } from "@/lib/prompt-library";
import { PromptForm } from "./_components/prompt-form";
import { PromptList } from "./_components/prompt-list";

export default async function PromptLibraryPage() {
  const { membership } = await requireActiveMembership("/dashboard/prompt-library");
  const prompts = await listPromptTemplates(membership.organizationId);

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Prompt Library</h1>
            <p className="text-sm text-muted-foreground">
              Reusable prompts for sales, marketing, proposals, negotiation, recruitment, support, analysis, content,
              email, and presentations — real {"{{"}placeholder{"}}"} tokens, same convention as workflow AI Action
              nodes. Install a Prompt Pack from the Marketplace, or save your own.
            </p>
          </div>
          <PromptForm />
        </div>

        {prompts.length === 0 ? (
          <Card glass>
            <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
              <Sparkles className="size-8 text-muted-foreground" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">
                No prompts yet. Save your first one, or install a Prompt Pack from the Marketplace.
              </p>
            </CardContent>
          </Card>
        ) : (
          <PromptList prompts={prompts} />
        )}
      </Container>
    </main>
  );
}
