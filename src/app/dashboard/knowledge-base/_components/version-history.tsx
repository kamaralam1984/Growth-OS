"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { History, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { restoreArticleVersion } from "../actions";

export interface VersionRow {
  id: string;
  title: string;
  content: string;
  editedByName: string | null;
  createdAt: string;
}

export interface VersionHistoryProps {
  articleId: string;
  versions: VersionRow[];
  canRestore: boolean;
}

export function VersionHistory({ articleId, versions, canRestore }: VersionHistoryProps) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleRestore(versionId: string) {
    if (!confirm("Restore this version? The current title/content will be saved as a new version first.")) return;
    setRestoringId(versionId);
    startTransition(async () => {
      const result = await restoreArticleVersion(articleId, versionId);
      if (!result.ok) {
        toast.error(result.error ?? "Something went wrong.");
        setRestoringId(null);
        return;
      }
      toast.success("Version restored.");
      router.refresh();
    });
  }

  if (versions.length === 0) {
    return <p className="text-sm text-muted-foreground">No prior versions yet — edits create a snapshot automatically.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {versions.map((version) => {
        const expanded = expandedId === version.id;
        return (
          <Card key={version.id}>
            <CardContent className="flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <History className="size-4 text-muted-foreground" />
                  <span className="font-medium text-foreground">{version.title}</span>
                  <span className="text-muted-foreground">
                    — {new Date(version.createdAt).toLocaleString()}
                    {version.editedByName ? ` by ${version.editedByName}` : ""}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setExpandedId(expanded ? null : version.id)}>
                    {expanded ? "Hide" : "View"}
                  </Button>
                  {canRestore && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleRestore(version.id)}
                      disabled={pending && restoringId === version.id}
                    >
                      <RotateCcw className="size-4" /> Restore
                    </Button>
                  )}
                </div>
              </div>
              {expanded && (
                <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/30 p-3 text-sm text-foreground">
                  {version.content}
                </pre>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
