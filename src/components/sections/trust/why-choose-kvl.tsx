import { Check, X } from "lucide-react";

import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Card } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { COMPARISON_ROWS } from "@/lib/trust-content";

/** Grounded in this platform's real, already-verified feature set. */
function WhyChooseKVL() {
  if (COMPARISON_ROWS.length === 0) {
    return null;
  }

  return (
    <section className="relative py-24 sm:py-32">
      <Container className="flex flex-col items-center gap-14">
        <SectionHeading
          eyebrow="Why KVL"
          title="Why companies choose KVL over a typical agency"
          description="No misleading claims — this is what's actually built into the platform and our engagement terms."
        />

        <Card glass className="w-full overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/3">Category</TableHead>
                <TableHead className="w-1/3">
                  <span className="text-primary">KVL Business Solutions</span>
                </TableHead>
                <TableHead className="w-1/3 text-muted-foreground">Typical Software Agency</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {COMPARISON_ROWS.map((row) => (
                <TableRow key={row.category}>
                  <TableCell className="font-medium text-foreground">{row.category}</TableCell>
                  <TableCell>
                    <span className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={2.5} />
                      <span className="text-foreground">{row.kvl}</span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-start gap-2 text-muted-foreground">
                      <X className="mt-0.5 size-4 shrink-0" strokeWidth={2.5} />
                      {row.typicalAgency}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </Container>
    </section>
  );
}

export default WhyChooseKVL;
export { WhyChooseKVL };
