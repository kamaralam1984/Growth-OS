"use client";

import { useState, useTransition } from "react";
import { Users, UserPlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addProjectMember, removeProjectMember } from "../../actions";
import type { ProjectRoleInput } from "@/lib/validations/project";

export interface ProjectTeamMember {
  userId: string;
  name: string | null;
  email: string | null;
  role: ProjectRoleInput;
  hourlyRate: number | null;
  capacityHoursPerWeek: number | null;
  /** Real assigned-open-hours / real capacity across every project they're on — null when no capacity is set. */
  utilizationPercent: number | null;
}

const ROLES: ProjectRoleInput[] = ["PROJECT_MANAGER", "DEVELOPER", "DESIGNER", "QA", "DEVOPS", "CONSULTANT", "STAKEHOLDER"];

export function ProjectTeamPanel({
  projectId,
  canManage,
  members,
  orgMembers,
}: {
  projectId: string;
  canManage: boolean;
  members: ProjectTeamMember[];
  orgMembers: Array<{ id: string; name: string | null; email: string | null }>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<ProjectRoleInput>("DEVELOPER");
  const [hourlyRate, setHourlyRate] = useState("");
  const [capacity, setCapacity] = useState("");

  const availableToAdd = orgMembers.filter((m) => !members.some((mem) => mem.userId === m.id));

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addProjectMember(projectId, {
        userId,
        role,
        hourlyRate: hourlyRate ? Number(hourlyRate) : undefined,
        capacityHoursPerWeek: capacity ? Number(capacity) : undefined,
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setAdding(false);
      setUserId("");
      setHourlyRate("");
      setCapacity("");
    });
  }

  function handleRemove(memberUserId: string) {
    startTransition(async () => {
      await removeProjectMember(projectId, memberUserId);
    });
  }

  return (
    <Card glass>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="size-4" /> Delivery team
        </CardTitle>
        {canManage && !adding && (
          <Button type="button" size="sm" variant="outline" onClick={() => setAdding(true)}>
            <UserPlus className="size-4" /> Add
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {members.length === 0 && <p className="text-sm text-muted-foreground">No team members added yet.</p>}
        {members.map((m) => (
          <div key={m.userId} className="flex items-center justify-between gap-2 border-b border-border/60 pb-2 last:border-0">
            <div>
              <p className="text-sm font-medium text-foreground">{m.name ?? m.email ?? "Team member"}</p>
              <p className="text-xs text-muted-foreground">
                {m.role.replace(/_/g, " ")}
                {m.capacityHoursPerWeek ? ` · ${m.capacityHoursPerWeek}h/week` : ""}
                {m.hourlyRate ? ` · $${m.hourlyRate}/hr` : ""}
                {m.utilizationPercent != null ? ` · ${m.utilizationPercent}% utilized` : ""}
              </p>
            </div>
            {canManage && (
              <Button type="button" size="sm" variant="ghost" onClick={() => handleRemove(m.userId)} disabled={pending} aria-label="Remove">
                <X className="size-3.5" />
              </Button>
            )}
          </div>
        ))}

        {adding && (
          <form onSubmit={handleAdd} className="flex flex-col gap-2 rounded-xl border border-border/60 p-3">
            <Select value={userId} onChange={(e) => setUserId(e.target.value)} required>
              <option value="">Choose a team member</option>
              {availableToAdd.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name ?? m.email}
                </option>
              ))}
            </Select>
            <div className="grid grid-cols-3 gap-2">
              <Select value={role} onChange={(e) => setRole(e.target.value as ProjectRoleInput)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>
              <Input type="number" min="0" placeholder="$/hr" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} />
              <Input type="number" min="0" placeholder="hrs/week" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending || !userId}>
                {pending ? "Adding…" : "Add to team"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
