import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface OrgFeatureRow {
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  source: "override" | "plan" | "default";
}

const SOURCE_LABELS: Record<OrgFeatureRow["source"], string> = {
  override: "Override",
  plan: "Plan",
  default: "Default",
};

/** Read-only, informational view for any active member — real listOrganizationFeatures() results, no mutation controls (an org can't grant itself a feature its plan doesn't include). */
export function OrgFeaturesTable({ features }: { features: OrgFeatureRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Feature</TableHead>
          <TableHead>Description</TableHead>
          <TableHead className="text-center">Status</TableHead>
          <TableHead className="text-center">Source</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {features.map((feature) => (
          <TableRow key={feature.key}>
            <TableCell>
              <p className="font-medium text-foreground">{feature.name}</p>
              <p className="font-mono text-xs text-muted-foreground">{feature.key}</p>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">{feature.description ?? "—"}</TableCell>
            <TableCell className="text-center">
              <Badge variant={feature.enabled ? "accent" : "secondary"}>{feature.enabled ? "Enabled" : "Disabled"}</Badge>
            </TableCell>
            <TableCell className="text-center">
              <Badge variant="outline">{SOURCE_LABELS[feature.source]}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
