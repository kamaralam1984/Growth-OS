import Link from "next/link";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { requirePlatformOwner } from "@/lib/billing/platform-admin";
import { CreateIncidentForm } from "./_components/create-incident-form";

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

/**
 * Platform-operator-only incident tracker (Incident/IncidentUpdate — "Final
 * Phase: Enterprise Security, Monitoring, DR, Compliance" in
 * prisma/schema.prisma). Platform-wide, not organization-scoped — CRITICAL
 * SecurityEvents (e.g. BRUTE_FORCE_DETECTED) auto-open an incident here (see
 * ensureIncidentForCriticalEvent in src/lib/security/incidents.ts, called
 * from logSecurityEvent); an operator can also open one manually below.
 */
export default async function AdminIncidentsPage() {
  await requirePlatformOwner("/admin/incidents");

  const incidents = await prisma.incident.findMany({
    orderBy: [{ status: "asc" }, { startedAt: "desc" }],
    include: { _count: { select: { updates: true } } },
  });

  const openCount = incidents.filter((i) => i.status !== "RESOLVED").length;

  return (
    <Container className="flex flex-col gap-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Incidents</h1>
        <p className="text-sm text-muted-foreground">
          {openCount} open of {incidents.length} total. CRITICAL security events (e.g. brute-force detection) open an
          incident here automatically; operators can also declare one manually below.
        </p>
      </div>

      <Card glass>
        <CardHeader>
          <CardTitle>Declare a new incident</CardTitle>
          <CardDescription>Manually opens a real Incident row, independent of the automatic security trigger.</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateIncidentForm />
        </CardContent>
      </Card>

      <Card glass>
        <CardHeader>
          <CardTitle>All incidents</CardTitle>
          <CardDescription>{incidents.length} total</CardDescription>
        </CardHeader>
        <CardContent>
          {incidents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No incidents recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Updates</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {incidents.map((incident) => (
                  <TableRow key={incident.id}>
                    <TableCell className="text-foreground">{incident.title}</TableCell>
                    <TableCell>
                      <Badge variant={SEVERITY_VARIANT[incident.severity] ?? "outline"}>{incident.severity}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[incident.status] ?? "outline"}>{incident.status}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDateTime(incident.startedAt)}</TableCell>
                    <TableCell className="text-muted-foreground">{incident._count.updates}</TableCell>
                    <TableCell>
                      <Link href={`/admin/incidents/${incident.id}`} className="text-sm font-medium text-primary hover:underline">
                        View timeline →
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </Container>
  );
}
