"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import {
  clearOrgFeatureOverrideAction,
  getOrgFeatureOverridesAction,
  searchOrganizationsAction,
  setOrgFeatureOverrideAction,
  type OrgFlagOverrideRow,
  type OrgSearchResult,
} from "../actions";

/** Real per-organization override manager — search a real Organization by name, then force one FeatureFlag on/off for it (or clear back to Plan/default resolution). */
export function OrgOverrideManager() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OrgSearchResult[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<OrgSearchResult | null>(null);
  const [rows, setRows] = useState<OrgFlagOverrideRow[]>([]);
  const [isSearching, startSearch] = useTransition();
  const [isLoadingRows, startLoadRows] = useTransition();
  const [pendingFlagId, setPendingFlagId] = useState<string | null>(null);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim()) return;
    startSearch(async () => {
      const orgs = await searchOrganizationsAction(query.trim());
      setResults(orgs);
    });
  }

  function selectOrg(org: OrgSearchResult) {
    setSelectedOrg(org);
    startLoadRows(async () => {
      const orgRows = await getOrgFeatureOverridesAction(org.id);
      setRows(orgRows);
    });
  }

  function refreshRows(orgId: string) {
    startLoadRows(async () => {
      const orgRows = await getOrgFeatureOverridesAction(orgId);
      setRows(orgRows);
    });
  }

  function forceFlag(flagId: string, enabled: boolean) {
    if (!selectedOrg) return;
    setPendingFlagId(flagId);
    (async () => {
      const result = await setOrgFeatureOverrideAction(selectedOrg.id, flagId, enabled);
      setPendingFlagId(null);
      if (!result.ok) {
        toast.error(result.error ?? "Failed to set override.");
        return;
      }
      toast.success(`Override set for ${selectedOrg.name}.`);
      refreshRows(selectedOrg.id);
    })();
  }

  function clearFlag(flagId: string) {
    if (!selectedOrg) return;
    setPendingFlagId(flagId);
    (async () => {
      const result = await clearOrgFeatureOverrideAction(selectedOrg.id, flagId);
      setPendingFlagId(null);
      if (!result.ok) {
        toast.error(result.error ?? "Failed to clear override.");
        return;
      }
      toast.success(`Override cleared for ${selectedOrg.name}.`);
      refreshRows(selectedOrg.id);
    })();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Per-organization overrides</h3>
          <p className="text-xs text-muted-foreground">Search an organization to force a feature on/off for it specifically.</p>
        </div>
        <Badge variant="accent">Platform operator</Badge>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search organizations by name…" className="h-9" />
        <Button type="submit" size="sm" variant="secondary" disabled={isSearching || !query.trim()}>
          <Search className="size-3.5" /> Search
        </Button>
      </form>

      {results.length > 0 && !selectedOrg && (
        <div className="flex flex-wrap gap-2">
          {results.map((org) => (
            <button
              key={org.id}
              type="button"
              onClick={() => selectOrg(org)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-accent"
            >
              {org.name}
            </button>
          ))}
        </div>
      )}

      {selectedOrg && (
        <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">{selectedOrg.name}</p>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setSelectedOrg(null); setRows([]); setResults([]); setQuery(""); }}>
              Change organization
            </Button>
          </div>

          {isLoadingRows && rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading flags…</p>
          ) : (
            <div className="flex flex-col gap-2">
              {rows.map((row) => (
                <div key={row.flagId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{row.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{row.key}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={row.overrideEnabled === null ? "outline" : row.overrideEnabled ? "accent" : "secondary"}>
                      {row.overrideEnabled === null ? "No override (Plan/default)" : row.overrideEnabled ? "Forced ON" : "Forced OFF"}
                    </Badge>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pendingFlagId === row.flagId || row.overrideEnabled === true}
                      onClick={() => forceFlag(row.flagId, true)}
                    >
                      Force on
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pendingFlagId === row.flagId || row.overrideEnabled === false}
                      onClick={() => forceFlag(row.flagId, false)}
                    >
                      Force off
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pendingFlagId === row.flagId || row.overrideEnabled === null}
                      onClick={() => clearFlag(row.flagId)}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
