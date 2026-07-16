import { prisma } from "@/lib/prisma";
import { notifyOrganizationOwners } from "@/lib/notifications";
import { fireWorkflowTrigger } from "@/lib/workflows/triggers";
import { seedStandardMilestones } from "@/lib/projects/milestones";
import { ensureProjectManagerAgentProvisioned } from "@/lib/ai/project-manager-orchestrator";

/**
 * Resolves the Client a newly-Won Deal's Project should belong to.
 * Deal has no direct clientId — only companyId/contactId — so this walks
 * Company.clients (one-to-many): exactly one existing Client → use it;
 * zero → create one from the deal's company (or contact, if there's no
 * company) — a real relationship starting at Won, never a guess; more than
 * one candidate → leave clientId null and let the owner link manually
 * rather than picking arbitrarily.
 */
async function resolveProjectClientId(deal: {
  organizationId: string;
  companyId: string | null;
  contactId: string | null;
}): Promise<{ clientId: string | null; ambiguous: boolean }> {
  if (deal.companyId) {
    const existingClients = await prisma.client.findMany({ where: { companyId: deal.companyId } });
    if (existingClients.length === 1) return { clientId: existingClients[0].id, ambiguous: false };
    if (existingClients.length > 1) return { clientId: null, ambiguous: true };

    const company = await prisma.company.findUnique({ where: { id: deal.companyId } });
    if (company) {
      const created = await prisma.client.create({
        data: {
          organizationId: deal.organizationId,
          companyId: company.id,
          name: company.name,
          email: company.email,
          phone: company.phone,
        },
      });
      return { clientId: created.id, ambiguous: false };
    }
  }

  if (deal.contactId) {
    const contact = await prisma.contact.findUnique({ where: { id: deal.contactId } });
    if (contact) {
      const created = await prisma.client.create({
        data: {
          organizationId: deal.organizationId,
          companyId: contact.companyId,
          name: [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email,
          email: contact.email,
          phone: contact.phone,
        },
      });
      return { clientId: created.id, ambiguous: false };
    }
  }

  return { clientId: null, ambiguous: false };
}

export interface ConvertWonDealResult {
  projectId: string;
  clientId: string | null;
  clientAmbiguous: boolean;
}

/**
 * Auto-creates a Project from a Deal that just moved to "Won" — idempotent
 * (does nothing if a Project already links this dealId, so re-triggering
 * the same stage move never duplicates work).
 */
export async function convertWonDealToProject(dealId: string): Promise<ConvertWonDealResult | null> {
  const existingProject = await prisma.project.findFirst({ where: { dealId } });
  if (existingProject) {
    return { projectId: existingProject.id, clientId: existingProject.clientId, clientAmbiguous: false };
  }

  const deal = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!deal) return null;

  const { clientId, ambiguous } = await resolveProjectClientId(deal);

  const project = await prisma.project.create({
    data: {
      organizationId: deal.organizationId,
      companyId: deal.companyId,
      clientId,
      dealId: deal.id,
      name: deal.name,
      budget: deal.value,
      priority: deal.priority,
      ownerUserId: deal.ownerUserId,
    },
  });

  await seedStandardMilestones(project.id);

  if (deal.ownerUserId) {
    const ownerMembership = await prisma.membership.findFirst({
      where: { userId: deal.ownerUserId, organizationId: deal.organizationId, status: "ACTIVE" },
    });
    if (ownerMembership) {
      await prisma.projectMember.create({
        data: {
          projectId: project.id,
          userId: deal.ownerUserId,
          organizationId: deal.organizationId,
          role: "PROJECT_MANAGER",
        },
      });
    }
  }

  await ensureProjectManagerAgentProvisioned(deal.organizationId);

  await notifyOrganizationOwners({
    organizationId: deal.organizationId,
    type: "PROJECT_CREATED",
    title: "New project created",
    message: ambiguous
      ? `"${project.name}" was created from a Won deal, but multiple clients matched — link the client manually.`
      : `"${project.name}" was auto-created from a Won deal and is ready for delivery setup.`,
  });
  await fireWorkflowTrigger(deal.organizationId, "PROJECT_CREATED", { projectId: project.id, name: project.name, dealId: deal.id, companyId: project.companyId, clientId, budget: project.budget });

  return { projectId: project.id, clientId, clientAmbiguous: ambiguous };
}
