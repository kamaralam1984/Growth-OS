import { z } from "zod";

import { generateStructured } from "@/lib/ai/fallback";
import { recordAIUsage } from "@/lib/billing/ai-credits";
import { isAIConnected } from "@/lib/ai/client";
import { getPersona } from "@/lib/ai/personas";
import type { AlertRuleResult } from "./rules";

const MitigationSchema = z.object({
  suggestions: z.array(z.string().trim().min(1)).min(1).max(5),
});

/**
 * One small AI call grounded strictly in an alert's own already-deterministic
 * title/message/formula — never invents a fact about the organization
 * beyond what the alert itself states. Best-effort: returns [] on any
 * failure or when AI isn't configured, so it can never block real alert
 * creation (called from engine.ts's create/reactivate branch only).
 */
export async function generateMitigationSuggestions(organizationId: string, result: AlertRuleResult): Promise<string[]> {
  if (!isAIConnected()) return [];

  try {
    const persona = getPersona("CEO");
    const response = await generateStructured({
      system: `${persona.systemPrompt}\n\nYou are suggesting mitigation steps for a real, already-triggered business alert. Ground every suggestion strictly in the alert's own real title/message/formula given below — never invent a fact, number, or cause not present in that data.`,
      userContent: `Alert: "${result.title}"\n${result.message}\nFormula: ${result.formula}\n\nSuggest 1-5 concrete, actionable mitigation steps.`,
      maxTokens: 512,
      effort: "low",
      schema: MitigationSchema,
    });
    await recordAIUsage(organizationId, response.provider, response.model, response.inputTokens, response.outputTokens, "alerts:mitigation-suggestions");
    return response.parsed.suggestions;
  } catch {
    return [];
  }
}
