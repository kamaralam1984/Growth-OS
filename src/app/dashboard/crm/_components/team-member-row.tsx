"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { formatCurrency } from "@/app/dashboard/_lib/format";
import { updateMemberRole } from "../_lib/team-actions";
import type { MembershipRole } from "@/generated/prisma/client";

const ROLES: MembershipRole[] = ["OWNER", "ADMIN", "MANAGER", "SALES", "MARKETING", "DEVELOPER", "SUPPORT", "FINANCE", "HR", "VIEWER"];

export interface TeamMemberRowProps {
  userId: string;
  name: string | null;
  email: string | null;
  role: MembershipRole;
  openDealsCount: number;
  openDealsValue: number;
  openTasksCount: number;
  canManageRoles: boolean;
  currency?: string | null;
}

export function TeamMemberRow({ userId, name, email, role, openDealsCount, openDealsValue, openTasksCount, canManageRoles, currency }: TeamMemberRowProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRoleChange(nextRole: MembershipRole) {
    setError(null);
    startTransition(async () => {
      const result = await updateMemberRole(userId, nextRole);
      if (!result.ok) {
        setError(result.error ?? "Couldn't update role.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="glass-panel flex flex-wrap items-center justify-between gap-4 rounded-xl p-4 text-sm">
      <div className="min-w-0">
        <p className="font-medium text-foreground">{name ?? email ?? userId}</p>
        {name && email && <p className="text-xs text-muted-foreground">{email}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{openDealsCount}</span> open deals ({formatCurrency(openDealsValue, currency)})
        </div>
        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{openTasksCount}</span> open tasks
        </div>
        {canManageRoles ? (
          <Select value={role} onChange={(e) => handleRoleChange(e.target.value as MembershipRole)} disabled={pending} className="max-w-[160px]">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        ) : (
          <Badge variant="outline">{role}</Badge>
        )}
      </div>
      {error && <p className="w-full text-xs text-destructive">{error}</p>}
    </div>
  );
}
