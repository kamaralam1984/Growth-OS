"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "@/components/ui/toast";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { researchCompanyNowAction } from "../actions";

interface DiscoveredCompany {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  createdAt: string;
  scoreBand: string | null;
  overallScore: number | null;
}

export function DiscoveredLeadsList({ companies, canManage }: { companies: DiscoveredCompany[]; canManage: boolean }) {
  return (
    <Card glass>
      <CardHeader>
        <CardTitle>Auto-Discovered Leads</CardTitle>
        <CardDescription>Companies found by the autonomous discovery job — never a duplicate of an existing CRM company.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {companies.length === 0 && <p className="text-sm text-muted-foreground">No companies discovered yet.</p>}
        {companies.map((c) => (
          <CompanyRow key={c.id} company={c} canManage={canManage} />
        ))}
      </CardContent>
    </Card>
  );
}

function CompanyRow({ company, canManage }: { company: DiscoveredCompany; canManage: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
      <div className="min-w-0">
        <Link href={`/dashboard/companies/${company.id}`} className="text-sm font-medium text-foreground hover:underline">
          {company.name}
        </Link>
        <p className="truncate text-xs text-muted-foreground">
          {company.industry ?? "Industry unknown"} — discovered {new Date(company.createdAt).toLocaleDateString()}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {company.scoreBand ? (
          <Badge variant={company.scoreBand === "HOT" ? "accent" : company.scoreBand === "WARM" ? "outline" : "secondary"}>
            {company.scoreBand} {company.overallScore}
          </Badge>
        ) : (
          <Badge variant="secondary">Not scored</Badge>
        )}
        {canManage && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await researchCompanyNowAction(company.id);
                if (!result.ok) toast.error(result.error ?? "Research failed.");
                else {
                  toast.success("Research complete.");
                  router.refresh();
                }
              })
            }
          >
            {pending ? "Researching…" : "Research now"}
          </Button>
        )}
      </div>
    </div>
  );
}
