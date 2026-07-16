"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Copy, Eye, EyeOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { revokeLicenseAction } from "../actions";

export interface LicenseRow {
  id: string;
  type: string;
  key: string;
  status: string;
  seats: number | null;
  issuedAt: string;
  expiresAt: string | null;
  activatedAt: string | null;
  lastVerifiedAt: string | null;
}

export interface LicensesListProps {
  licenses: LicenseRow[];
  canManage: boolean;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "accent"> = {
  ACTIVE: "accent",
  EXPIRED: "secondary",
  REVOKED: "outline",
};

function maskKey(key: string): string {
  const segments = key.split("-");
  if (segments.length < 2) return key;
  return [segments[0], ...segments.slice(1, -1).map(() => "••••"), segments[segments.length - 1]].join("-");
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function LicensesList({ licenses, canManage }: LicensesListProps) {
  const router = useRouter();
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggleReveal(id: string) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function copyKey(key: string) {
    try {
      await navigator.clipboard.writeText(key);
      toast.success("License key copied.");
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  }

  function handleRevoke(row: LicenseRow) {
    if (!confirm(`Revoke this ${row.type} license? Anything using it will stop verifying immediately.`)) return;
    setRevokingId(row.id);
    startTransition(async () => {
      const result = await revokeLicenseAction(row.id);
      setRevokingId(null);
      if (!result.ok) {
        toast.error(result.error ?? "Could not revoke this license.");
        return;
      }
      toast.success("License revoked.");
      router.refresh();
    });
  }

  if (licenses.length === 0) {
    return <p className="text-sm text-muted-foreground">No licenses issued yet.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Type</TableHead>
          <TableHead>Key</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Seats</TableHead>
          <TableHead>Issued</TableHead>
          <TableHead>Expires</TableHead>
          <TableHead>Last verified</TableHead>
          {canManage && <TableHead className="text-right">Actions</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {licenses.map((row) => {
          const isRevealed = revealed.has(row.id);
          return (
            <TableRow key={row.id}>
              <TableCell>
                <Badge variant="outline">{row.type}</Badge>
              </TableCell>
              <TableCell className="font-mono text-xs">
                <div className="flex items-center gap-2">
                  <span>{isRevealed ? row.key : maskKey(row.key)}</span>
                  <button
                    type="button"
                    onClick={() => toggleReveal(row.id)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={isRevealed ? "Hide key" : "Reveal key"}
                  >
                    {isRevealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => copyKey(row.key)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Copy key"
                  >
                    <Copy className="size-3.5" />
                  </button>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[row.status] ?? "outline"}>{row.status}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">{row.seats ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">{formatDate(row.issuedAt)}</TableCell>
              <TableCell className="text-muted-foreground">{formatDate(row.expiresAt)}</TableCell>
              <TableCell className="text-muted-foreground">{formatDate(row.lastVerifiedAt)}</TableCell>
              {canManage && (
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleRevoke(row)}
                    disabled={row.status === "REVOKED" || revokingId === row.id}
                    className="text-red-500 hover:bg-red-500/10"
                  >
                    {revokingId === row.id ? "Revoking..." : "Revoke"}
                  </Button>
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
