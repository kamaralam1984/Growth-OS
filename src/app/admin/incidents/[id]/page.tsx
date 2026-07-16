import { notFound } from "next/navigation";
import Link from "next/link";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { requirePlatformOwner } from "@/lib/billing/platform-admin";
import { AddIncidentUpdateForm } from "../_components/add-incident-update-form";
import { ResolveIncidentForm } from "../_components/resolve-incident-form";

const SEVERITY_VARIANT: Record<string, "default" | "secondary" | "outline" | "accent"> = {
  LOW: "secondary",
  MEDIUM: "outline",
  HIGH: "accent",
  CRITICAL: "default",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "accent"> = {
  OPEN: "default",
  INVESTIGATING: "accent",
  MONITORING: "outline",
  RESOLVED: "secondary",
};

function formatDateTime(date: Date): string {
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function AdminIncidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformOwner("/admin/incidents");
  const { id } = await params;

  const incident = await prisma.incident.findUnique({
    where: { id },
    include: { updates: { orderBy: { createdAt: "asc" } } },
  });
  if (!incident) notFound();

  const isResolved = incident.status === "RESOLVED";

  return (
    <Container className="flex flex-col gap-6 py-8">
      <div>
        <Link href="/admin/incidents" className="text-sm text-muted-foreground hover:underline">
          ← All incidents
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-foreground">{incident.title}</h1>
          <Badge variant={SEVERITY_VARIANT[incident.severity] ?? "outline"}>{incident.severity}</Badge>
          <Badge variant={STATUS_VARIANT[incident.status] ?? "outline"}>{incident.status}</Badge>
        </div>
        {incident.description && <p className="mt-2 text-sm text-muted-foreground">{incident.description}</p>}
        <p className="mt-1 text-xs text-muted-foreground">
          Started {formatDateTime(incident.startedAt)}
          {incident.resolvedAt ? ` · Resolved ${formatDateTime(incident.resolvedAt)}` : ""}
        </p>
      </div>

      <Card glass>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
          <CardDescription>Real, append-only IncidentUpdate history — never edited once written.</CardDescription>
        </CardHeader>
        <CardContent>
          {incident.updates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No updates yet.</p>
          ) : (
            <ol className="flex flex-col gap-4 border-l border-border pl-4">
              {incident.updates.map((update) => (
                <li key={update.id} className="relative">
                  <span className="absolute -left-[1.3rem] top-1 size-2 rounded-full bg-primary" />
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={STATUS_VARIANT[update.status] ?? "outline"}>{update.status}</Badge>
                    <span className="text-xs text-muted-foreground">{formatDateTime(update.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-sm text-foreground">{update.message}</p>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {!isResolved && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card glass>
            <CardHeader>
              <CardTitle>Add update</CardTitle>
              <CardDescription>Appends a new timeline entry and moves the incident&apos;s own status.</CardDescription>
            </CardHeader>
            <CardContent>
              <AddIncidentUpdateForm incidentId={incident.id} currentStatus={incident.status} />
            </CardContent>
          </Card>

          <Card glass>
            <CardHeader>
              <CardTitle>Resolve</CardTitle>
              <CardDescription>Marks the incident RESOLVED and records an optional postmortem.</CardDescription>
            </CardHeader>
            <CardContent>
              <ResolveIncidentForm incidentId={incident.id} />
            </CardContent>
          </Card>
        </div>
      )}

      {isResolved && incident.postmortem && (
        <Card glass>
          <CardHeader>
            <CardTitle>Postmortem</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-foreground">{incident.postmortem}</p>
          </CardContent>
        </Card>
      )}
    </Container>
  );
}
