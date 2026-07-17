import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { requirePlatformOwner } from "@/lib/billing/platform-admin";
import { listChangeRequests, getChangeManagementSummary } from "@/lib/security/change-management";
import { CreateChangeRequestForm } from "./_components/create-change-request-form";
import { ChangeStatusControl } from "./_components/change-status-control";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "accent"> = {
  PROPOSED: "secondary",
  APPROVED: "outline",
  REJECTED: "default",
  DEPLOYED: "accent",
  ROLLED_BACK: "default",
};

/**
 * SOC2 CC8.1 change management — a real approval trail for production
 * changes, optionally linked to the real Deployment row it produced.
 */
export default async function AdminChangeManagementPage() {
  await requirePlatformOwner("/admin/compliance/changes");

  const [changes, summary] = await Promise.all([listChangeRequests(), getChangeManagementSummary()]);

  return (
    <Container className="flex flex-col gap-6 py-8">
      <div>
        <Link href="/admin/compliance" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to Compliance Readiness
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Change Management</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          A real approval trail for production changes (SOC2 CC8.1). Status only ever moves forward through an
          explicit admin action.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card glass>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-semibold text-foreground">{summary.total}</p>
          </CardContent>
        </Card>
        <Card glass>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Proposed</p>
            <p className="text-2xl font-semibold text-foreground">{summary.proposed}</p>
          </CardContent>
        </Card>
        <Card glass>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Approved</p>
            <p className="text-2xl font-semibold text-foreground">{summary.approved}</p>
          </CardContent>
        </Card>
        <Card glass>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Deployed</p>
            <p className="text-2xl font-semibold text-foreground">{summary.deployed}</p>
          </CardContent>
        </Card>
      </div>

      <Card glass>
        <CardHeader>
          <CardTitle>Propose a change</CardTitle>
          <CardDescription>Real production changes only — never a placeholder row.</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateChangeRequestForm />
        </CardContent>
      </Card>

      <Card glass>
        <CardHeader>
          <CardTitle>All change requests</CardTitle>
          <CardDescription>{changes.length} total.</CardDescription>
        </CardHeader>
        <CardContent>
          {changes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No change requests recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {changes.map((change) => (
                  <TableRow key={change.id}>
                    <TableCell className="max-w-[240px] text-foreground">
                      <p className="truncate font-medium">{change.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{change.description}</p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{change.changeType}</TableCell>
                    <TableCell className="text-muted-foreground">{change.riskLevel}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[change.status] ?? "outline"}>{change.status.replace(/_/g, " ")}</Badge>
                    </TableCell>
                    <TableCell>
                      <ChangeStatusControl changeId={change.id} status={change.status} />
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
