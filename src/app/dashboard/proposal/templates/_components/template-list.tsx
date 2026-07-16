"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Star } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { deleteDocumentTemplate } from "../../_lib/template-actions";

export interface TemplateRow {
  id: string;
  name: string;
  docKind: string;
  category: string | null;
  isDefault: boolean;
}

export function TemplateList({ templates }: { templates: TemplateRow[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  if (templates.length === 0) {
    return <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No templates yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {templates.map((t) => (
        <Card key={t.id} glass>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-2">
              {t.isDefault && <Star className="size-4 text-primary" />}
              <div>
                <p className="font-medium text-foreground">{t.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t.docKind.replace(/_/g, " ")}
                  {t.category ? ` · ${t.category.replace(/_/g, " ")}` : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{t.docKind.replace(/_/g, " ")}</Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  startTransition(async () => {
                    await deleteDocumentTemplate(t.id);
                    router.refresh();
                  })
                }
                aria-label="Delete template"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
