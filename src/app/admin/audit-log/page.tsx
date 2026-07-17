import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { requirePlatformOwner } from "@/lib/billing/platform-admin";
import { queryAuditLog, listDistinctAuditActions } from "@/lib/security/audit-log-query";

function formatDateTime(date: Date): string {
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

interface AuditLogSearchParams {
  action?: string;
  organizationId?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Platform-owner-only, cross-org filterable view over the real AuditLog
 * hash-chained table (src/lib/audit.ts / src/lib/audit-chain-verify.ts) —
 * previously only queryable self-scoped from the profile page. Every row
 * shown here is a real, tamper-evident AuditLog row; filters narrow via
 * plain Prisma `where`, never a fabricated summary.
 */
export default async function AdminAuditLogPage({ searchParams }: { searchParams: Promise<AuditLogSearchParams> }) {
  await requirePlatformOwner("/admin/audit-log");

  const params = await searchParams;
  const [rows, actions] = await Promise.all([
    queryAuditLog({
      action: params.action || undefined,
      organizationId: params.organizationId || undefined,
      userId: params.userId || undefined,
      dateFrom: params.dateFrom ? new Date(params.dateFrom) : undefined,
      dateTo: params.dateTo ? new Date(params.dateTo) : undefined,
    }),
    listDistinctAuditActions(),
  ]);

  return (
    <Container className="flex flex-col gap-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Audit Log</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Every real, hash-chained AuditLog row across every organization — the same tamper-evident data each user
          sees self-scoped in their profile, now filterable across the whole platform. Showing the most recent 100
          matches.
        </p>
      </div>

      <Card glass>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="get" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <FormField label="Action" htmlFor="filter-action">
              <Select id="filter-action" name="action" defaultValue={params.action ?? ""}>
                <option value="">All actions</option>
                {actions.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Organization ID" htmlFor="filter-org">
              <Input id="filter-org" name="organizationId" defaultValue={params.organizationId ?? ""} placeholder="org id" />
            </FormField>
            <FormField label="User ID" htmlFor="filter-user">
              <Input id="filter-user" name="userId" defaultValue={params.userId ?? ""} placeholder="user id" />
            </FormField>
            <FormField label="From" htmlFor="filter-from">
              <Input id="filter-from" name="dateFrom" type="date" defaultValue={params.dateFrom ?? ""} />
            </FormField>
            <FormField label="To" htmlFor="filter-to">
              <Input id="filter-to" name="dateTo" type="date" defaultValue={params.dateTo ?? ""} />
            </FormField>
            <div className="flex items-end lg:col-span-5">
              <Button type="submit" size="sm">
                Apply filters
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card glass>
        <CardHeader>
          <CardTitle>Results</CardTitle>
          <CardDescription>{rows.length} row(s){rows.length === 100 && " (limit reached — narrow your filters)"}</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No matching audit log entries.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(row.createdAt)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.action}</Badge>
                    </TableCell>
                    <TableCell className="text-foreground">{row.user?.name || row.user?.email || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{row.organization?.name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{row.ipAddress || "—"}</TableCell>
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
