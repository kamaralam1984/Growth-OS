"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { updateDiscoverySettingsAction, runDiscoveryNowAction } from "../actions";

const WEIGHT_FACTORS = [
  ["industryMatchScore", "Industry match"],
  ["companySizeScore", "Company size"],
  ["growthScore", "Growth signals"],
  ["technologyFitScore", "Technology fit"],
  ["opportunitySizeScore", "Opportunity size"],
  ["budgetPotentialScore", "Budget potential"],
  ["locationScore", "Location"],
  ["digitalMaturityScore", "Digital maturity"],
  ["automationNeedScore", "Automation need"],
] as const;

interface Config {
  discoveryEnabled: boolean;
  searchQueries: string[];
  scoringWeights: Record<string, number> | null;
  outreachAutoMode: string;
}

export function DiscoverySettingsForm({ config, canManage, isOwner }: { config: Config; canManage: boolean; isOwner: boolean }) {
  const [enabled, setEnabled] = useState(config.discoveryEnabled);
  const [queriesText, setQueriesText] = useState(config.searchQueries.join("\n"));
  const [weights, setWeights] = useState<Record<string, number>>(
    Object.fromEntries(WEIGHT_FACTORS.map(([key]) => [key, config.scoringWeights?.[key] ?? 1])),
  );
  const [useCustomWeights, setUseCustomWeights] = useState(config.scoringWeights !== null);
  const [outreachAutoMode, setOutreachAutoMode] = useState(config.outreachAutoMode);
  const [pending, startTransition] = useTransition();
  const [runningNow, startRunNow] = useTransition();
  const router = useRouter();

  const save = () =>
    startTransition(async () => {
      const result = await updateDiscoverySettingsAction({
        discoveryEnabled: enabled,
        searchQueries: queriesText
          .split("\n")
          .map((q) => q.trim())
          .filter(Boolean),
        scoringWeights: useCustomWeights ? weights : null,
        outreachAutoMode: outreachAutoMode as never,
      });
      if (!result.ok) toast.error(result.error ?? "Could not save settings.");
      else {
        toast.success("Saved.");
        router.refresh();
      }
    });

  return (
    <Card glass>
      <CardHeader>
        <CardTitle>Discovery Settings</CardTitle>
        <CardDescription>
          Off by default. When enabled, a scheduled job searches the web for real, named companies matching your
          queries — same engine as manual Lead Finder — and researches them automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={enabled} disabled={!canManage} onChange={(e) => setEnabled(e.target.checked)} />
          Enable autonomous lead discovery for this organization
        </label>

        <FormField label="Search queries (one per line)" htmlFor="queries" hint="Empty = derived automatically from your industry/client types/countries served.">
          <textarea
            id="queries"
            rows={3}
            value={queriesText}
            disabled={!canManage}
            onChange={(e) => setQueriesText(e.target.value)}
            placeholder="e.g. fintech companies in UAE"
            className="w-full rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </FormField>

        <FormField label="Outreach mode" htmlFor="outreachMode" hint="Draft Only = AI drafts, a human sends manually (default, unchanged behavior). Queue for Approval = drafts auto-request owner/admin approval. Auto-Send = owner-only, still fully logged.">
          <Select
            id="outreachMode"
            value={outreachAutoMode}
            disabled={!canManage}
            onChange={(e) => setOutreachAutoMode(e.target.value)}
          >
            <option value="DRAFT_ONLY">Draft Only</option>
            <option value="QUEUE_FOR_APPROVAL">Queue for Approval</option>
            <option value="AUTO_SEND" disabled={!isOwner}>
              Auto-Send {isOwner ? "" : "(owner only)"}
            </option>
          </Select>
        </FormField>

        <div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={useCustomWeights} disabled={!canManage} onChange={(e) => setUseCustomWeights(e.target.checked)} />
            Customize lead-scoring weights (default: equal weight on all 9 factors)
          </label>
          {useCustomWeights && (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {WEIGHT_FACTORS.map(([key, label]) => (
                <FormField key={key} label={label} htmlFor={key}>
                  <input
                    id={key}
                    type="number"
                    min={0}
                    max={10}
                    step={0.5}
                    disabled={!canManage}
                    value={weights[key]}
                    onChange={(e) => setWeights((w) => ({ ...w, [key]: Number(e.target.value) }))}
                    className="w-full rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </FormField>
              ))}
            </div>
          )}
        </div>

        {canManage && (
          <div className="flex gap-2 border-t border-border pt-4">
            <Button disabled={pending} onClick={save}>
              {pending ? "Saving…" : "Save settings"}
            </Button>
            <Button
              variant="outline"
              disabled={runningNow || !enabled}
              onClick={() =>
                startRunNow(async () => {
                  const result = await runDiscoveryNowAction();
                  if (!result.ok) toast.error(result.error ?? "Could not run discovery.");
                  else {
                    toast.success("Discovery run started.");
                    router.refresh();
                  }
                })
              }
            >
              {runningNow ? "Running…" : "Run discovery now"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
