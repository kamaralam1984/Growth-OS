"use client";

import { useMemo, useState, useTransition } from "react";
import { RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { replayEventAction } from "../actions";

export interface EventLogRow {
  id: string;
  eventType: string;
  payload: unknown;
  publishedAt: string;
  replayedAt: string | null;
  replayCount: number;
}

export interface EventLogListProps {
  events: EventLogRow[];
  eventTypes: string[];
  canReplay: boolean;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function payloadPreview(payload: unknown): string {
  const json = JSON.stringify(payload);
  return json.length > 80 ? `${json.slice(0, 80)}…` : json;
}

export function EventLogList({ events: initial, eventTypes, canReplay }: EventLogListProps) {
  const [events, setEvents] = useState(initial);
  const [filter, setFilter] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const filtered = useMemo(
    () => (filter === "all" ? events : events.filter((e) => e.eventType === filter)),
    [events, filter],
  );

  function handleReplay(id: string) {
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      const result = await replayEventAction(id);
      setPendingId(null);
      if (!result.ok) {
        setError(result.error ?? "Could not replay this event.");
        return;
      }
      setEvents((prev) =>
        prev.map((e) => (e.id === id ? { ...e, replayCount: e.replayCount + 1, replayedAt: new Date().toISOString() } : e)),
      );
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <label htmlFor="event-type-filter" className="text-sm text-muted-foreground">
          Filter by type
        </label>
        <Select
          id="event-type-filter"
          className="w-auto"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All types</option>
          {eventTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </Select>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No events logged yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Payload</TableHead>
              <TableHead>Published</TableHead>
              <TableHead>Replays</TableHead>
              {canReplay && <TableHead>&nbsp;</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((event) => (
              <TableRow key={event.id}>
                <TableCell>
                  <Badge variant="outline">{event.eventType}</Badge>
                </TableCell>
                <TableCell className="max-w-md">
                  <details>
                    <summary className="cursor-pointer text-xs text-muted-foreground">{payloadPreview(event.payload)}</summary>
                    <pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 text-xs">
                      {JSON.stringify(event.payload, null, 2)}
                    </pre>
                  </details>
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(event.publishedAt)}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {event.replayCount}
                  {event.replayedAt && <span className="ml-1 text-xs">(last {formatDateTime(event.replayedAt)})</span>}
                </TableCell>
                {canReplay && (
                  <TableCell>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleReplay(event.id)}
                      disabled={pendingId === event.id}
                    >
                      <RotateCcw className="size-3.5" />
                      {pendingId === event.id ? "Replaying…" : "Replay"}
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
