import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { requirePlatformOwner } from "@/lib/billing/platform-admin";
import { listPolicies, getPolicyCenterSummary } from "@/lib/security/policy-center";
import { CreatePolicyForm } from "./_components/create-policy-form";
import { PolicyStatusControl } from "./_components/policy-status-control";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "accent"> = {
  DRAFT: "secondary",
  PUBLISHED: "accent",
  ARCHIVED: "outline",
};

function formatDate(date: Date | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * SOC2 CC1-CC5 / ISO27001 A.5 policy center — real, versioned,
 * admin-authored policy documents, distinct from the static docs/guides/
 * narrative documentation.
 */
export default async function AdminPolicyCenterPage() {
  await requirePlatformOwner("/admin/compliance/policies");

  const [policies, summary] = await Promise.all([listPolicies(), getPolicyCenterSummary()]);

  return (
    <Container className="flex flex-col gap-6 py-8">
      <div>
        <Link href="/admin/compliance" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to Compliance Readiness
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Policy Center</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Real, versioned information security policies (SOC2 CC1-CC5 / ISO 27001 A.5). Editing published content bumps
          the version automatically.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card glass>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Total policies</p>
            <p className="text-2xl font-semibold text-foreground">{summary.total}</p>
          </CardContent>
        </Card>
        <Card glass>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Published</p>
            <p className="text-2xl font-semibold text-foreground">{summary.published}</p>
          </CardContent>
        </Card>
        <Card glass>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Draft</p>
            <p className="text-2xl font-semibold text-foreground">{summary.draft}</p>
          </CardContent>
        </Card>
        <Card glass>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Overdue for review</p>
            <p className="text-2xl font-semibold text-foreground">{summary.overdueForReview}</p>
          </CardContent>
        </Card>
      </div>

      <Card glass>
        <CardHeader>
          <CardTitle>Add a policy</CardTitle>
          <CardDescription>New policies start as drafts. Publish once reviewed.</CardDescription>
        </CardHeader>
        <CardContent>
          <CreatePolicyForm />
        </CardContent>
      </Card>

      <Card glass>
        <CardHeader>
          <CardTitle>All policies</CardTitle>
          <CardDescription>{policies.length} total.</CardDescription>
        </CardHeader>
        <CardContent>
          {policies.length === 0 ? (
            <p className="text-sm text-muted-foreground">No policies recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Review due</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies.map((policy) => (
                  <TableRow key={policy.id}>
                    <TableCell className="max-w-[280px] text-foreground">
                      <p className="truncate font-medium">{policy.title}</p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{policy.category.replace(/_/g, " ")}</TableCell>
                    <TableCell className="text-foreground">v{policy.version}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[policy.status] ?? "outline"}>{policy.status}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(policy.reviewDueAt)}</TableCell>
                    <TableCell>
                      <PolicyStatusControl policyId={policy.id} status={policy.status} />
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
