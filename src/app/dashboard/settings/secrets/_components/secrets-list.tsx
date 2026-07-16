"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { deleteSecretAction } from "../actions";
import type { RotateTarget } from "./create-secret-form";

export interface SecretRow {
  id: string;
  key: string;
  category: string;
  description: string | null;
  lastRotatedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface SecretsListProps {
  initialSecrets: SecretRow[];
  onRotate?: (target: RotateTarget) => void;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Deliberately renders `initialSecrets` directly rather than mirroring it
 * into local state — the list always reflects whatever the server most
 * recently returned, refreshed via router.refresh() after a delete/rotate,
 * so there's no separate client-side copy of secret metadata to drift out
 * of sync (and, per this module's charter, nothing here ever touches a
 * secret's decrypted value).
 */
export function SecretsList({ initialSecrets, onRotate }: SecretsListProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleDelete(row: SecretRow) {
    if (!confirm(`Delete secret "${row.key}"? Any Workflow node referencing it will start failing.`)) return;
    setDeletingId(row.id);
    startTransition(async () => {
      const result = await deleteSecretAction(row.id);
      setDeletingId(null);
      if (!result.ok) {
        toast.error(result.error ?? "Could not delete this secret.");
        return;
      }
      toast.success("Secret deleted.");
      router.refresh();
    });
  }

  if (initialSecrets.length === 0) {
    return <p className="text-sm text-muted-foreground">No secrets yet.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Key</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Last rotated</TableHead>
          <TableHead>Last used</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {initialSecrets.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium text-foreground">
              <code className="text-xs">{row.key}</code>
            </TableCell>
            <TableCell>
              <Badge variant="outline">{row.category.replaceAll("_", " ")}</Badge>
            </TableCell>
            <TableCell className="text-muted-foreground">{row.description || "—"}</TableCell>
            <TableCell className="text-muted-foreground">{formatDateTime(row.lastRotatedAt)}</TableCell>
            <TableCell className="text-muted-foreground">{formatDateTime(row.lastUsedAt)}</TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    onRotate?.({
                      key: row.key,
                      category: row.category as RotateTarget["category"],
                      description: row.description ?? "",
                    })
                  }
                >
                  Rotate
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(row)}
                  disabled={deletingId === row.id}
                  className="text-red-500 hover:bg-red-500/10"
                >
                  {deletingId === row.id ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
