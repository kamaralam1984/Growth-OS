"use client";

import * as React from "react";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { cn } from "@/lib/utils";
import { fadeInUp } from "@/animations";
import { getUserOrganizationId } from "@/app/onboarding/agents-actions";
import { inviteTeamMembers, type InviteResult } from "./actions";

const ROLE_OPTIONS = [
  { value: "OWNER", label: "Owner" },
  { value: "ADMIN", label: "Admin" },
  { value: "MANAGER", label: "Manager" },
  { value: "SALES", label: "Sales" },
  { value: "MARKETING", label: "Marketing" },
  { value: "DEVELOPER", label: "Developer" },
  { value: "SUPPORT", label: "Support" },
  { value: "FINANCE", label: "Finance" },
  { value: "HR", label: "HR" },
  { value: "VIEWER", label: "Viewer" },
] as const;

interface InviteRow {
  id: string;
  email: string;
  role: (typeof ROLE_OPTIONS)[number]["value"];
}

function newRow(): InviteRow {
  return { id: crypto.randomUUID(), email: "", role: "VIEWER" };
}

export default function InviteTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ organizationId?: string | string[] }>;
}) {
  const params = use(searchParams);
  const paramOrgId = Array.isArray(params.organizationId)
    ? params.organizationId[0]
    : params.organizationId;

  const router = useRouter();
  const [rows, setRows] = useState<InviteRow[]>([newRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<InviteResult[] | null>(null);

  function updateRow(id: string, patch: Partial<InviteRow>) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((prev) => [...prev, newRow()]);
  }

  function removeRow(id: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((row) => row.id !== id) : prev));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const orgId = paramOrgId ?? (await getUserOrganizationId());
      if (!orgId) {
        setError(
          "We couldn't find an organization for your account yet. Finish setting up your company profile first.",
        );
        setSubmitting(false);
        return;
      }

      const invites = rows
        .map((row) => ({ email: row.email.trim(), role: row.role }))
        .filter((row) => row.email.length > 0);

      if (invites.length === 0) {
        setError("Add at least one email address.");
        setSubmitting(false);
        return;
      }

      const outcome = await inviteTeamMembers(orgId, invites);
      setResults(outcome);

      const anySent = outcome.some((r) => r.status === "sent");
      const anyFailed = outcome.some((r) => r.status === "error");
      if (anySent && !anyFailed) {
        router.push("/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong sending invitations.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-svh bg-background py-20 sm:py-28">
      <Container className="flex flex-col items-center gap-10">
        <SectionHeading
          eyebrow="Almost there"
          title="Invite your team"
          description="Bring in the people who'll work alongside your AI agents. You can always invite more teammates later."
        />

        <Card glass className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle>Teammates</CardTitle>
            <CardDescription>Add an email and pick a role for each person you want to invite.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-3">
                {rows.map((row, index) => (
                  <motion.div
                    key={row.id}
                    variants={fadeInUp}
                    initial="hidden"
                    animate="visible"
                    className="flex flex-col gap-2 sm:flex-row sm:items-center"
                  >
                    <Input
                      type="email"
                      placeholder={`teammate${index + 1}@company.com`}
                      value={row.email}
                      onChange={(e) => updateRow(row.id, { email: e.target.value })}
                      className="sm:flex-1"
                    />
                    <select
                      value={row.role}
                      onChange={(e) =>
                        updateRow(row.id, { role: e.target.value as InviteRow["role"] })
                      }
                      className={cn(
                        "h-11 rounded-lg border border-input bg-transparent px-3.5 text-sm text-foreground transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-40",
                      )}
                    >
                      {ROLE_OPTIONS.map((role) => (
                        <option key={role.value} value={role.value} className="bg-background text-foreground">
                          {role.label}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeRow(row.id)}
                      disabled={rows.length === 1}
                      aria-label="Remove row"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </motion.div>
                ))}
              </div>

              <Button type="button" variant="outline" size="sm" onClick={addRow} className="self-start">
                <Plus className="size-4" />
                Add another
              </Button>

              {error && <p className="text-sm text-destructive">{error}</p>}

              {results && (
                <div className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
                  {results.map((result) => (
                    <div key={result.email} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-foreground">{result.email}</span>
                      <Badge
                        variant={
                          result.status === "sent"
                            ? "accent"
                            : result.status === "already_member"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {result.status === "sent"
                          ? "Invited"
                          : result.status === "already_member"
                            ? "Already a member"
                            : "Failed"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-2 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
                <Link href="/dashboard" className="text-sm text-muted-foreground underline underline-offset-4">
                  Skip for now
                </Link>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Sending invites..." : "Finish"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </Container>
    </main>
  );
}
