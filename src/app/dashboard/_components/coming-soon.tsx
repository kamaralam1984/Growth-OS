import type { LucideIcon } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";

/** Honest empty-state stub for sidebar items with no backing system yet — no fake data, no screenshots. */
export function ComingSoon({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <main className="min-h-svh bg-background py-12">
      <Container>
        <Card glass>
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <Icon className="size-8 text-muted-foreground" strokeWidth={1.5} />
            <h1 className="text-lg font-semibold tracking-tight text-foreground">{title}</h1>
            <p className="max-w-md text-sm text-muted-foreground">{description}</p>
          </CardContent>
        </Card>
      </Container>
    </main>
  );
}
