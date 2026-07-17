import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Persona {
  id: string;
  companyName: string;
  likelyTitle: string;
  description: string;
  painPoints: string[];
  preferredChannel: string | null;
  confidenceScore: number;
  isVerified: boolean;
}

export function BuyerPersonasList({ personas }: { personas: Persona[] }) {
  return (
    <Card glass>
      <CardHeader>
        <CardTitle>Buyer Personas</CardTitle>
        <CardDescription>
          Probable decision-maker roles per company — AI inference unless a real matching Contact exists (
          <Badge variant="accent">Verified</Badge>).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {personas.length === 0 && <p className="text-sm text-muted-foreground">No buyer personas generated yet.</p>}
        {personas.map((p) => (
          <div key={p.id} className="rounded-lg border border-border p-3">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-sm font-medium text-foreground">{p.likelyTitle}</span>
                <span className="ml-2 text-sm text-muted-foreground">at {p.companyName}</span>
              </div>
              <div className="flex items-center gap-1.5">
                {p.isVerified ? <Badge variant="accent">Verified</Badge> : <Badge variant="secondary">AI inference</Badge>}
                <Badge variant="outline">{p.confidenceScore}% confidence</Badge>
                {p.preferredChannel && <Badge variant="outline">{p.preferredChannel}</Badge>}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{p.description}</p>
            {p.painPoints.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">Pain points: {p.painPoints.join(", ")}</p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
