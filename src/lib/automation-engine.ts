import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { notifyOrganizationOwners } from "@/lib/notifications";
import type { AutomationTrigger, AgentType } from "@/generated/prisma/client";

const VALID_AGENT_TYPES = new Set<AgentType>(["CEO", "SALES", "MARKETING", "PROPOSAL", "OUTREACH", "CRM", "ANALYTICS"]);

function asAgentType(value: string | undefined): AgentType | null {
  return value && VALID_AGENT_TYPES.has(value as AgentType) ? (value as AgentType) : null;
}

export interface AutomationContext {
  /** Human-readable subject of whatever fired the trigger — a lead name, task title, meeting title, decision topic, deal name, or document title. */
  subject: string;
  leadId?: string;
  taskId?: string;
  meetingId?: string;
  decisionId?: string;
  dealId?: string;
  proposalId?: string;
  quotationId?: string;
  contractId?: string;
  invoiceId?: string;
  businessDocumentId?: string;
}

/**
 * Real, synchronous rule execution — runs inline inside the server action
 * that fired the trigger (createLead, task-status-update, meeting end,
 * decision finalize). There is no job queue or cron in this app, so this is
 * the honest way to make automation actually fire rather than just being
 * configuration nobody runs. Never throws — a broken rule must not break the
 * action that triggered it, exactly like logActivity/notifyUser.
 */
export async function evaluateAutomationRules(
  organizationId: string,
  trigger: AutomationTrigger,
  context: AutomationContext,
): Promise<void> {
  try {
    const rules = await prisma.automationRule.findMany({
      where: { organizationId, trigger, active: true },
    });
    if (rules.length === 0) return;

    for (const rule of rules) {
      const config = (rule.actionConfig as Record<string, string> | null) ?? {};
      try {
        if (rule.action === "CREATE_TASK") {
          const title = config.title || `Follow up: ${context.subject}`;
          let assignedToAgentId: string | null = null;
          const agentType = asAgentType(config.agentType);
          if (agentType) {
            const agent = await prisma.aIAgentInstance.findUnique({
              where: { organizationId_type: { organizationId, type: agentType } },
            });
            assignedToAgentId = agent?.id ?? null;
          }
          await prisma.task.create({
            data: {
              organizationId,
              title,
              description: config.description || `Auto-created by automation rule "${rule.name}".`,
              assignedToAgentId,
            },
          });
        } else if (rule.action === "ASSIGN_AGENT" && asAgentType(config.agentType)) {
          const agent = await prisma.aIAgentInstance.findUnique({
            where: { organizationId_type: { organizationId, type: asAgentType(config.agentType)! } },
          });
          if (agent) {
            await prisma.task.create({
              data: {
                organizationId,
                title: config.title || `Review: ${context.subject}`,
                description: `Auto-assigned by automation rule "${rule.name}".`,
                assignedToAgentId: agent.id,
              },
            });
          }
        } else if (rule.action === "SEND_NOTIFICATION") {
          await notifyOrganizationOwners({
            organizationId,
            type: "AUTOMATION_EVENT",
            title: config.title || rule.name,
            message: config.message || `Triggered by: ${context.subject}`,
          });
        }

        await prisma.automationRule.update({
          where: { id: rule.id },
          data: { runCount: { increment: 1 }, lastRunAt: new Date() },
        });

        await logActivity({
          organizationId,
          type: "SYSTEM_EVENT",
          description: `Automation rule "${rule.name}" fired (${trigger} → ${rule.action}).`,
          metadata: { ruleId: rule.id, trigger, action: rule.action },
        });
      } catch (ruleError) {
        console.error(`[automation-engine] rule ${rule.id} failed:`, ruleError);
      }
    }
  } catch (error) {
    console.error("[automation-engine] evaluateAutomationRules failed:", error);
  }
}
