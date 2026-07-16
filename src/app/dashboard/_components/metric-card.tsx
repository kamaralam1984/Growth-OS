import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

export function MetricCard({
  icon: Icon,
  label,
  value,
  sublabel,
  href,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  sublabel?: string;
  href?: string;
  className?: string;
}) {
  const content = (
    <CardContent className="flex items-start gap-3 p-5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{value}</div>
        {sublabel && <p className="mt-0.5 text-xs text-muted-foreground">{sublabel}</p>}
      </div>
    </CardContent>
  );

  if (href) {
    return (
      <Link href={href} className={cn("block", className)}>
        <Card className="h-full transition-colors hover:bg-accent/30">{content}</Card>
      </Link>
    );
  }

  return <Card className={className}>{content}</Card>;
}
