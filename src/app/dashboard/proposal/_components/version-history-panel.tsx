import { History } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/utils";

export interface VersionHistoryEntry {
  id: string;
  versionNumber: number;
  changeNote: string | null;
  changedByUserName: string | null;
  createdAt: Date;
}

/** Reused on every document type's detail page — Draft/Review/Approved/Rejected/Archived status changes and content edits all snapshot here (see src/lib/documents/versioning.ts). */
export function VersionHistoryPanel({ versions }: { versions: VersionHistoryEntry[] }) {
  return (
    <Card glass>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4" /> Version History
        </CardTitle>
        <CardDescription>Every save creates a new version — nothing is silently overwritten.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No versions yet.</p>
        ) : (
          versions.map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
              <div>
                <p className="font-medium text-foreground">Version {v.versionNumber}</p>
                <p className="text-xs text-muted-foreground">
                  {v.changeNote ?? "Edited"}
                  {v.changedByUserName ? ` · ${v.changedByUserName}` : ""}
                </p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(v.createdAt)}</span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
