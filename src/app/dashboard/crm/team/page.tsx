import { Container } from "@/components/ui/container";
import { requireActiveMembership } from "../../_lib/require-membership";
import { getTeamWorkspace } from "../_lib/team-actions";
import { TeamMemberRow } from "../_components/team-member-row";

export default async function CrmTeamPage() {
  const { membership } = await requireActiveMembership("/dashboard/crm/team");
  const canManageRoles = membership.role === "OWNER" || membership.role === "ADMIN";

  const workload = await getTeamWorkspace(membership.organizationId);

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Team Workspace</h1>
          <p className="text-sm text-muted-foreground">
            Every active member, their role (Owner, Sales, Marketing, Support, Manager, Developer, Finance, or
            AI Agent), and their real open-deal and open-task workload.
            {!canManageRoles && " Only owners and admins can change roles."}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {workload.map((m) => (
            <TeamMemberRow
              key={m.userId}
              userId={m.userId}
              name={m.name}
              email={m.email}
              role={m.role}
              openDealsCount={m.openDealsCount}
              openDealsValue={m.openDealsValue}
              openTasksCount={m.openTasksCount}
              canManageRoles={canManageRoles}
              currency={membership.organization.currency}
            />
          ))}
        </div>
      </Container>
    </main>
  );
}
