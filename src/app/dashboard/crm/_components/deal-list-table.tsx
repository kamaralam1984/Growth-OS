"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { formatCurrency } from "@/app/dashboard/_lib/format";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

export interface DealListRow {
  id: string;
  name: string;
  stageName: string;
  value: number | null;
  probability: number | null;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  ownerUserId: string | null;
  ownerName: string | null;
  expectedCloseDate: string | null;
}

export interface DealListTableProps {
  deals: DealListRow[];
  owners: Array<{ userId: string; name: string | null; email: string | null }>;
  currency?: string | null;
}

const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

/** Filterable Deals table — Owner / Priority / free-text search, all client-side over the org's real deals. */
export function DealListTable({ deals, owners, currency }: DealListTableProps) {
  const [owner, setOwner] = useState("");
  const [priority, setPriority] = useState("");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    return deals.filter((d) => {
      if (owner && d.ownerUserId !== owner) return false;
      if (priority && d.priority !== priority) return false;
      if (query && !d.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
      return true;
    });
  }, [deals, owner, priority, query]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <Input placeholder="Search deals…" value={query} onChange={(e) => setQuery(e.target.value)} className="max-w-xs" />
        <Select value={owner} onChange={(e) => setOwner(e.target.value)} className="max-w-[200px]">
          <option value="">All owners</option>
          {owners.map((o) => (
            <option key={o.userId} value={o.userId}>
              {o.name ?? o.email ?? o.userId}
            </option>
          ))}
        </Select>
        <Select value={priority} onChange={(e) => setPriority(e.target.value)} className="max-w-[160px]">
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="p-3 font-medium">Deal</th>
              <th className="p-3 font-medium">Stage</th>
              <th className="p-3 font-medium">Value</th>
              <th className="p-3 font-medium">Probability</th>
              <th className="p-3 font-medium">Priority</th>
              <th className="p-3 font-medium">Owner</th>
              <th className="p-3 font-medium">Expected Close</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  No deals match these filters.
                </td>
              </tr>
            ) : (
              filtered.map((d) => (
                <tr key={d.id} className="border-b border-border last:border-0 hover:bg-accent/20">
                  <td className="p-3">
                    <Link href={`/dashboard/crm/deals/${d.id}`} className="font-medium text-foreground hover:text-primary hover:underline">
                      {d.name}
                    </Link>
                  </td>
                  <td className="p-3 text-muted-foreground">{d.stageName}</td>
                  <td className="p-3 text-foreground">{d.value != null ? formatCurrency(d.value, currency) : "—"}</td>
                  <td className="p-3 text-muted-foreground">{d.probability != null ? `${d.probability}%` : "—"}</td>
                  <td className="p-3 text-muted-foreground">{d.priority}</td>
                  <td className="p-3 text-muted-foreground">{d.ownerName ?? "Unassigned"}</td>
                  <td className="p-3 text-muted-foreground">{d.expectedCloseDate ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
