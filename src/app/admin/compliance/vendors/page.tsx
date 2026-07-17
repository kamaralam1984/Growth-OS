import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { requirePlatformOwner } from "@/lib/billing/platform-admin";
import { listVendors, getVendorRegisterSummary } from "@/lib/security/vendor-register";
import { CreateVendorForm } from "./_components/create-vendor-form";
import { VendorDpaToggle } from "./_components/vendor-dpa-toggle";

const RISK_VARIANT: Record<string, "default" | "secondary" | "outline" | "accent"> = {
  LOW: "secondary",
  MEDIUM: "outline",
  HIGH: "default",
};

/**
 * SOC2 CC9.2 vendor management + GDPR Art.28 sub-processor / Data
 * Processing Register — real, admin-maintained rows. Feeds compliance.ts's
 * checkVendorRegister() (replaces the previous hardcoded-manual
 * checkSubProcessorAgreements).
 */
export default async function AdminVendorRegisterPage() {
  await requirePlatformOwner("/admin/compliance/vendors");

  const [vendors, summary] = await Promise.all([listVendors(), getVendorRegisterSummary()]);

  return (
    <Container className="flex flex-col gap-6 py-8">
      <div>
        <Link href="/admin/compliance" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to Compliance Readiness
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Vendor &amp; Sub-processor Register</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Every real sub-processor that may touch personal or business data (SOC2 CC9.2 / GDPR Art.28), with what data
          flows to them and whether a DPA is on file. Doubles as the GDPR Data Processing Register.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card glass>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Total vendors</p>
            <p className="text-2xl font-semibold text-foreground">{summary.total}</p>
          </CardContent>
        </Card>
        <Card glass>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Active</p>
            <p className="text-2xl font-semibold text-foreground">{summary.active}</p>
          </CardContent>
        </Card>
        <Card glass>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">DPA on file</p>
            <p className="text-2xl font-semibold text-foreground">{summary.dpaSignedCount}</p>
          </CardContent>
        </Card>
        <Card glass>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Missing DPA (active)</p>
            <p className="text-2xl font-semibold text-foreground">{summary.missingDpaCount}</p>
          </CardContent>
        </Card>
      </div>

      <Card glass>
        <CardHeader>
          <CardTitle>Add a vendor</CardTitle>
          <CardDescription>Real sub-processors only — never a placeholder row.</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateVendorForm />
        </CardContent>
      </Card>

      <Card glass>
        <CardHeader>
          <CardTitle>All vendors</CardTitle>
          <CardDescription>{vendors.length} total.</CardDescription>
        </CardHeader>
        <CardContent>
          {vendors.length === 0 ? (
            <p className="text-sm text-muted-foreground">No vendors recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Data processed</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>DPA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendors.map((vendor) => (
                  <TableRow key={vendor.id}>
                    <TableCell className="max-w-[220px] text-foreground">
                      <p className="truncate font-medium">{vendor.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{vendor.purpose}</p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{vendor.category.replace(/_/g, " ")}</TableCell>
                    <TableCell className="max-w-[240px] truncate text-muted-foreground">{vendor.dataProcessed}</TableCell>
                    <TableCell>
                      <Badge variant={RISK_VARIANT[vendor.riskLevel] ?? "outline"}>{vendor.riskLevel}</Badge>
                    </TableCell>
                    <TableCell>
                      <VendorDpaToggle vendorId={vendor.id} dpaSigned={vendor.dpaSigned} />
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
