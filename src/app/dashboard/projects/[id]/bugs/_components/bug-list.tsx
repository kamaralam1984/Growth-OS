"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, X, ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { createBugReport, updateBugStatus, promoteBugToTask } from "../actions";
import type { BugSeverityInput, BugStatusInput } from "@/lib/validations/bug-reports";

export interface BugReportRow {
  id: string;
  title: string;
  description: string;
  severity: BugSeverityInput;
  status: BugStatusInput;
  reproSteps: string | null;
  environment: string | null;
  createdAt: string;
  task: { id: string; status: string } | null;
}

const SEVERITY_CLASS: Record<BugSeverityInput, string> = {
  LOW: "border-border bg-transparent text-foreground",
  MEDIUM: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  HIGH: "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400",
  CRITICAL: "border-destructive/30 bg-destructive/10 text-destructive",
};

const STATUS_VARIANT: Record<BugStatusInput, "default" | "secondary" | "outline" | "accent"> = {
  OPEN: "outline",
  IN_PROGRESS: "accent",
  FIXED: "default",
  VERIFIED: "default",
  WONT_FIX: "secondary",
};

const STATUS_OPTIONS: BugStatusInput[] = ["OPEN", "IN_PROGRESS", "FIXED", "VERIFIED", "WONT_FIX"];

interface BugFormState {
  title: string;
  description: string;
  severity: BugSeverityInput;
  reproSteps: string;
  environment: string;
}

const EMPTY: BugFormState = { title: "", description: "", severity: "MEDIUM", reproSteps: "", environment: "" };

export function BugList({ projectId, bugReports }: { projectId: string; bugReports: BugReportRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<BugFormState>(EMPTY);

  function set<K extends keyof BugFormState>(key: K, value: BugFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createBugReport(projectId, {
        title: form.title,
        description: form.description,
        severity: form.severity,
        reproSteps: form.reproSteps,
        environment: form.environment,
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setForm(EMPTY);
      setAdding(false);
      router.refresh();
    });
  }

  function handleStatusChange(bugId: string, status: BugStatusInput) {
    startTransition(async () => {
      await updateBugStatus(bugId, status);
      router.refresh();
    });
  }

  function handlePromote(bugId: string) {
    startTransition(async () => {
      const result = await promoteBugToTask(bugId);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    });
  }

  const openBugs = bugReports.filter((b) => b.status === "OPEN" || b.status === "IN_PROGRESS");
  const otherBugs = bugReports.filter((b) => b.status !== "OPEN" && b.status !== "IN_PROGRESS");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        {!adding ? (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Report bug
          </Button>
        ) : null}
      </div>

      {adding && (
        <Card glass>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Report a bug</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)} aria-label="Close">
              <X className="size-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAdd} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Title" htmlFor="bug-title" required className="sm:col-span-2">
                <Input id="bug-title" value={form.title} onChange={(e) => set("title", e.target.value)} required />
              </FormField>
              <FormField label="Description" htmlFor="bug-description" required className="sm:col-span-2">
                <textarea
                  id="bug-description"
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  rows={3}
                  required
                  className="w-full rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </FormField>
              <FormField label="Severity" htmlFor="bug-severity" required>
                <Select id="bug-severity" value={form.severity} onChange={(e) => set("severity", e.target.value as BugSeverityInput)}>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </Select>
              </FormField>
              <FormField label="Environment" htmlFor="bug-environment">
                <Input id="bug-environment" value={form.environment} onChange={(e) => set("environment", e.target.value)} placeholder="Production, Chrome 128" />
              </FormField>
              <FormField label="Reproduction steps" htmlFor="bug-repro" className="sm:col-span-2">
                <textarea
                  id="bug-repro"
                  value={form.reproSteps}
                  onChange={(e) => set("reproSteps", e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </FormField>
              {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
              <div className="sm:col-span-2">
                <Button type="submit" size="sm" disabled={pending || !form.title.trim() || !form.description.trim()}>
                  {pending ? "Reporting…" : "Report bug"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {bugReports.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">No bugs reported yet.</CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {[...openBugs, ...otherBugs].map((bug) => (
            <Card key={bug.id} className={`border ${SEVERITY_CLASS[bug.severity]}`}>
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">{bug.title}</p>
                      <Badge className={SEVERITY_CLASS[bug.severity]} variant="outline">
                        {bug.severity}
                      </Badge>
                      <Badge variant={STATUS_VARIANT[bug.status]}>{bug.status.replace(/_/g, " ")}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{bug.description}</p>
                    {bug.reproSteps && <p className="mt-1 text-xs text-muted-foreground">Repro: {bug.reproSteps}</p>}
                    {bug.environment && <p className="mt-1 text-xs text-muted-foreground">Environment: {bug.environment}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">Reported {new Date(bug.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Select
                      value={bug.status}
                      onChange={(e) => handleStatusChange(bug.id, e.target.value as BugStatusInput)}
                      disabled={pending}
                      className="h-9 text-xs"
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {status.replace(/_/g, " ")}
                        </option>
                      ))}
                    </Select>
                    {bug.task ? (
                      <Link
                        href={`/dashboard/projects/${projectId}/board`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        View task <ArrowUpRight className="size-3" />
                      </Link>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => handlePromote(bug.id)} disabled={pending}>
                        Promote to task
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
