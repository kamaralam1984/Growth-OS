import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { requirePlatformOwner } from "@/lib/billing/platform-admin";
import { listSoAEntries, getSoASummary } from "@/lib/security/statement-of-applicability";
import { CreateSoAEntryForm } from "./_components/create-soa-entry-form";
import { SoAStatusControl } from "./_components/soa-status-control";

/**
 * ISO27001 Statement of Applicability — real, admin-authored control
 * scoping decisions. This app never pre-seeds official ISO 27001:2022
 * Annex A control text (see statement-of-applicability.ts's doc comment).
 */
export default async function AdminStatementOfApplicabilityPage() {
  await requirePlatformOwner("/admin/compliance/soa");

  const [entries, summary] = await Promise.all([listSoAEntries(), getSoASummary()]);

  return (
    <Container className="flex flex-col gap-6 py-8">
      <div>
        <Link href="/admin/compliance" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to Compliance Readiness
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Statement of Applicability</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Real, admin-authored ISO/IEC 27001:2022 Annex A control scoping decisions — applicability, justification, and
          implementation status per control.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card glass>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Total entries</p>
            <p className="text-2xl font-semibold text-foreground">{summary.total}</p>
          </CardContent>
        </Card>
        <Card glass>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Applicable</p>
            <p className="text-2xl font-semibold text-foreground">{summary.applicable}</p>
          </CardContent>
        </Card>
        <Card glass>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Implemented</p>
            <p className="text-2xl font-semibold text-foreground">{summary.implemented}</p>
          </CardContent>
        </Card>
        <Card glass>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Not yet implemented</p>
            <p className="text-2xl font-semibold text-foreground">{summary.notImplemented}</p>
          </CardContent>
        </Card>
      </div>

      <Card glass>
        <CardHeader>
          <CardTitle>Add a control entry</CardTitle>
          <CardDescription>One row per Annex A control your organization has scoped.</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateSoAEntryForm />
        </CardContent>
      </Card>

      <Card glass>
        <CardHeader>
          <CardTitle>All entries</CardTitle>
          <CardDescription>{entries.length} total.</CardDescription>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No entries recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Control</TableHead>
                  <TableHead>Theme</TableHead>
                  <TableHead>Applicable</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="max-w-[280px] text-foreground">
                      <p className="truncate font-medium">
                        {entry.controlId} — {entry.controlTitle}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{entry.justification}</p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{entry.theme}</TableCell>
                    <TableCell>
                      <Badge variant={entry.applicable ? "accent" : "secondary"}>{entry.applicable ? "Yes" : "No"}</Badge>
                    </TableCell>
                    <TableCell>
                      <SoAStatusControl entryId={entry.id} implementationStatus={entry.implementationStatus} />
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
