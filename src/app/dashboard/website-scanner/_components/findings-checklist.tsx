import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

export interface Finding {
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

const STATUS_ICON = { pass: CheckCircle2, warn: AlertTriangle, fail: XCircle } as const;
const STATUS_CLASS = { pass: "text-primary", warn: "text-amber-500", fail: "text-destructive" } as const;

/** Shared checklist renderer for real, verified findings — used across SEO/Performance/Security/UX tabs. */
export function FindingsChecklist({ findings }: { findings: Finding[] }) {
  if (findings.length === 0) return <p className="text-sm text-muted-foreground">No findings recorded.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {findings.map((f, i) => {
        const Icon = STATUS_ICON[f.status];
        return (
          <li key={i} className="flex items-start gap-2.5 text-sm">
            <Icon className={`mt-0.5 size-4 shrink-0 ${STATUS_CLASS[f.status]}`} />
            <div>
              <p className="font-medium text-foreground">{f.label}</p>
              <p className="text-xs text-muted-foreground">{f.detail}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
