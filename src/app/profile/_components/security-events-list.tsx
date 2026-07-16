import { ShieldAlert } from "lucide-react";

export interface SecurityEventRow {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface SecurityEventsListProps {
  events: SecurityEventRow[];
}

/**
 * Surfaces `AuditLog` rows written by src/auth.ts's detectSuspiciousLogin —
 * the "new device AND unfamiliar network" signal, distinct from (and rarer
 * than) the plain new-device email that fires on every unrecognized device.
 */
export function SecurityEventsList({ events }: SecurityEventsListProps) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No unusual sign-in activity detected.</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {events.map((event) => (
        <li
          key={event.id}
          className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
        >
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground">Unusual sign-in activity detected</span>
            <span className="text-xs text-muted-foreground">
              {event.ipAddress ?? "Unknown IP"} · {event.userAgent ?? "Unknown device"} ·{" "}
              {new Date(event.createdAt).toLocaleString()}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
