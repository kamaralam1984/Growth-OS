"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { formatCurrency } from "@/app/dashboard/_lib/format";
import { updateClientStatus } from "../actions";

export interface CrmClient {
  id: string;
  name: string;
  companyName: string | null;
  email: string | null;
  status: "ACTIVE" | "INACTIVE" | "CHURNED";
  contractValue: number | null;
}

export function ClientList({ clients, currency }: { clients: CrmClient[]; currency?: string | null }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  if (clients.length === 0) {
    return (
      <Card glass>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          No clients yet. Add one manually or promote a lead from the pipeline.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {clients.map((client) => (
        <Card key={client.id} glass>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-medium text-foreground">{client.name}</p>
              <p className="text-xs text-muted-foreground">
                {client.companyName ?? "No company"}
                {client.email ? ` · ${client.email}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {client.contractValue != null && (
                <span className="text-sm font-medium text-primary">
                  {formatCurrency(client.contractValue, currency)}
                </span>
              )}
              <Select
                value={client.status}
                onChange={(e) => {
                  const status = e.target.value as CrmClient["status"];
                  startTransition(async () => {
                    await updateClientStatus(client.id, status);
                    router.refresh();
                  });
                }}
                className="h-9 w-32 text-xs"
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="CHURNED">Churned</option>
              </Select>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
