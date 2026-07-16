"use client";

import { useRouter } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CreateLicenseForm } from "./create-license-form";
import { LicensesList, type LicenseRow } from "./licenses-list";

export interface LicensesManagerProps {
  licenses: LicenseRow[];
  canManage: boolean;
}

export function LicensesManager({ licenses, canManage }: LicensesManagerProps) {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-6">
      {canManage && (
        <Card glass>
          <CardHeader>
            <CardTitle>Generate a license</CardTitle>
            <CardDescription>
              The full key is only ever shown once, right after generation — copy it immediately. The list below
              always masks it by default.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreateLicenseForm onCreated={() => router.refresh()} />
          </CardContent>
        </Card>
      )}

      <Card glass>
        <CardHeader>
          <CardTitle>Issued licenses</CardTitle>
          <CardDescription>
            Every license your organization has generated for API access, seat-based installs, or an enterprise
            deployment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LicensesList licenses={licenses} canManage={canManage} />
        </CardContent>
      </Card>
    </div>
  );
}
