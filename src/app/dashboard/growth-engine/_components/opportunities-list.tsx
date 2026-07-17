import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Opportunity {
  id: string;
  companyId: string;
  companyName: string;
  category: string;
  title: string;
  description: string;
  estimatedImpact: string;
  estimatedValue: number | null;
  evidence: string;
  confidenceScore: number;
}

export function OpportunitiesList({ opportunities }: { opportunities: Opportunity[] }) {
  return (
    <Card glass>
      <CardHeader>
        <CardTitle>Opportunities</CardTitle>
        <CardDescription>AI-detected, evidence-cited opportunities per company — grounded in real Company Intelligence and Digital Audit data.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {opportunities.length === 0 && <p className="text-sm text-muted-foreground">No opportunities detected yet.</p>}
        {opportunities.map((o) => (
          <div key={o.id} className="rounded-lg border border-border p-3">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <div>
                <Link href={`/dashboard/companies/${o.companyId}`} className="text-sm font-medium text-foreground hover:underline">
                  {o.companyName}
                </Link>
                <span className="ml-2 text-sm text-muted-foreground">{o.title}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant="outline">{o.category}</Badge>
                <Badge variant={o.estimatedImpact === "high" ? "accent" : "outline"}>{o.estimatedImpact} impact</Badge>
                <Badge variant="secondary">{o.confidenceScore}% confidence</Badge>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{o.description}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Evidence: {o.evidence}
              {o.estimatedValue ? ` — est. value $${o.estimatedValue.toLocaleString()}` : ""}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
