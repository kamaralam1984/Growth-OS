import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { requirePlatformOwner } from "@/lib/billing/platform-admin";
import { listAssets, getAssetInventorySummary } from "@/lib/security/asset-inventory";
import { CreateAssetForm } from "./_components/create-asset-form";
import { AssetStatusControl } from "./_components/asset-status-control";

const CLASSIFICATION_VARIANT: Record<string, "default" | "secondary" | "outline" | "accent"> = {
  PUBLIC: "secondary",
  INTERNAL: "outline",
  CONFIDENTIAL: "accent",
  RESTRICTED: "default",
};

/**
 * ISO27001 A.5.9 asset inventory — real, admin-tracked assets, each with a
 * data classification.
 */
export default async function AdminAssetInventoryPage() {
  await requirePlatformOwner("/admin/compliance/assets");

  const [assets, summary] = await Promise.all([listAssets(), getAssetInventorySummary()]);

  return (
    <Container className="flex flex-col gap-6 py-8">
      <div>
        <Link href="/admin/compliance" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to Compliance Readiness
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Asset Inventory</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Real, admin-tracked information and infrastructure assets (ISO 27001 A.5.9), each with a data classification
          and an owner.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card glass>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Total assets</p>
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
            <p className="text-xs text-muted-foreground">Confidential / Restricted</p>
            <p className="text-2xl font-semibold text-foreground">
              {summary.byClassification.CONFIDENTIAL + summary.byClassification.RESTRICTED}
            </p>
          </CardContent>
        </Card>
        <Card glass>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">By classification</p>
            <p className="text-xs text-foreground">
              P {summary.byClassification.PUBLIC} · I {summary.byClassification.INTERNAL} · C {summary.byClassification.CONFIDENTIAL} · R{" "}
              {summary.byClassification.RESTRICTED}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card glass>
        <CardHeader>
          <CardTitle>Add an asset</CardTitle>
          <CardDescription>Real infrastructure/data/document assets only.</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateAssetForm />
        </CardContent>
      </Card>

      <Card glass>
        <CardHeader>
          <CardTitle>All assets</CardTitle>
          <CardDescription>{assets.length} total.</CardDescription>
        </CardHeader>
        <CardContent>
          {assets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assets recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Classification</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets.map((asset) => (
                  <TableRow key={asset.id}>
                    <TableCell className="max-w-[240px] text-foreground">
                      <p className="truncate font-medium">{asset.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{asset.description}</p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{asset.assetType.replace(/_/g, " ")}</TableCell>
                    <TableCell>
                      <Badge variant={CLASSIFICATION_VARIANT[asset.classification] ?? "outline"}>{asset.classification}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{asset.location ?? "—"}</TableCell>
                    <TableCell>
                      <AssetStatusControl assetId={asset.id} status={asset.status} />
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
