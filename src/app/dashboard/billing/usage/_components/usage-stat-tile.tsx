import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const WARNING_THRESHOLD_PCT = 80;

function formatQuantity(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return rounded.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * One usage stat tile — current vs. plan limit, with the same
 * h-2.5/bg-muted/bg-primary progress-bar convention as the Seats tile on
 * src/app/dashboard/billing/page.tsx, extended with a warning/danger color
 * shift as usage approaches or exceeds the limit. `limit: null` renders an
 * "Unlimited" state with no bar (a real "no cap" fact, never a fabricated
 * 100%-full or 0%-full bar).
 */
export function UsageStatTile({
  label,
  icon,
  current,
  limit,
  unit,
}: {
  label: string;
  icon?: ReactNode;
  current: number;
  limit: number | null;
  unit?: string;
}) {
  const pct = limit === null || limit <= 0 ? null : Math.min(100, (current / limit) * 100);
  const isOverLimit = limit !== null && current >= limit;
  const isNearLimit = pct !== null && pct >= WARNING_THRESHOLD_PCT && !isOverLimit;

  const barColorClass = isOverLimit ? "bg-red-500" : isNearLimit ? "bg-amber-500" : "bg-primary";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1.5">
          {icon}
          {label}
        </CardDescription>
        <CardTitle className={cn("text-2xl", isOverLimit && "text-red-500")}>
          {formatQuantity(current)}
          {unit ? <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span> : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {limit === null ? (
          <p className="text-xs text-muted-foreground">Unlimited on this plan</p>
        ) : (
          <>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full transition-[width]", barColorClass)}
                style={{ width: `${Math.max(pct ?? 0, current > 0 ? 4 : 0)}%` }}
              />
            </div>
            <p className={cn("mt-1.5 text-xs", isOverLimit ? "font-medium text-red-500" : "text-muted-foreground")}>
              {formatQuantity(current)} of {formatQuantity(limit)} {unit ?? ""}
              {isOverLimit ? " — over plan limit" : null}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
