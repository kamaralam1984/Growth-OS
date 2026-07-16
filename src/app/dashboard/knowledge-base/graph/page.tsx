import { Waypoints } from "lucide-react";

import { Container } from "@/components/ui/container";
import { requireActiveMembership } from "../../_lib/require-membership";
import { GraphExplorer } from "./_components/graph-explorer";

const REBUILD_ROLES = new Set(["OWNER", "ADMIN"]);

export default async function KnowledgeGraphPage() {
  const { membership } = await requireActiveMembership("/dashboard/knowledge-base/graph");
  const canRebuild = REBUILD_ROLES.has(membership.role);

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <Waypoints className="size-5" />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Knowledge Graph</h1>
              <p className="text-sm text-muted-foreground">
                Real relationships between your deals, projects, companies, people, meetings, tasks, and knowledge
                articles — derived from your actual CRM and delivery data, not a simulation.
              </p>
            </div>
          </div>
        </div>

        <GraphExplorer canRebuild={canRebuild} />
      </Container>
    </main>
  );
}
