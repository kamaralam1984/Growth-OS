import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { generateStructured } from "@/lib/ai/fallback";
import { recordAIUsage } from "@/lib/billing/ai-credits";
import { isAIConnected } from "@/lib/ai/client";
import { getPersona } from "@/lib/ai/personas";
import type { ClientOpportunity } from "@/generated/prisma/client";

/**
 * Upsell/Cross-sell/Referral Engine — real client-base scan, no invented
 * opportunities. Cross-sell/Upsell are entirely deterministic (real product
 * catalog and real subscription-tier comparisons); only Referral candidacy
 * involves one AI call, and only for clients whose real ClientHealthSnapshot
 * already crosses a health threshold — never speculative.
 */

const REFERRAL_HEALTH_THRESHOLD = 75;
const UPSELL_GAP_RATIO = 0.8; // this client's amount below 80% of another client's amount on the same plan name

/**
 * Real catalog of what the org actually sells — the union of Deal.products
 * + Deal.services across its own Won deals, org-wide. Never a hardcoded
 * service list.
 */
async function getOrgServiceCatalog(organizationId: string): Promise<Set<string>> {
  const wonDeals = await prisma.deal.findMany({
    where: { organizationId, dealStage: { name: "Won" } },
    select: { products: true, services: true },
  });
  const catalog = new Set<string>();
  for (const deal of wonDeals) {
    for (const p of deal.products) catalog.add(p);
    for (const s of deal.services) catalog.add(s);
  }
  return catalog;
}

async function getClientOwnedServices(clientId: string): Promise<Set<string>> {
  const [subscriptions, contracts] = await Promise.all([
    prisma.subscription.findMany({ where: { clientId, status: { in: ["ACTIVE", "TRIALING"] } }, select: { name: true } }),
    prisma.contract.findMany({ where: { clientId, status: "SIGNED" }, select: { type: true, title: true } }),
  ]);
  const owned = new Set<string>();
  for (const s of subscriptions) owned.add(s.name);
  for (const c of contracts) {
    owned.add(c.type);
    owned.add(c.title);
  }
  return owned;
}

async function generateCrossSellOpportunities(clientId: string, organizationId: string): Promise<Array<Omit<ClientOpportunity, "id" | "createdAt" | "generatedByAgentId" | "status">>> {
  const [catalog, owned] = await Promise.all([getOrgServiceCatalog(organizationId), getClientOwnedServices(clientId)]);
  const candidates = [...catalog].filter((item) => !owned.has(item));

  return candidates.slice(0, 5).map((item) => ({
    organizationId,
    clientId,
    kind: "CROSS_SELL" as const,
    title: `Cross-sell: ${item}`,
    description: `This client hasn't bought "${item}" yet, but it's a real service the organization has sold to other Won deals.`,
    estimatedValue: null,
    evidence: `"${item}" appears in this organization's own real Won-deal catalog (Deal.products/services) but not in this client's Subscriptions or signed Contracts.`,
    confidenceScore: 60,
  }));
}

async function generateUpsellOpportunities(clientId: string, organizationId: string): Promise<Array<Omit<ClientOpportunity, "id" | "createdAt" | "generatedByAgentId" | "status">>> {
  const [clientSubscriptions, orgSubscriptions] = await Promise.all([
    prisma.subscription.findMany({ where: { clientId, status: "ACTIVE" }, select: { name: true, amount: true } }),
    prisma.subscription.findMany({ where: { organizationId, status: "ACTIVE" }, select: { name: true, amount: true, clientId: true } }),
  ]);

  const opportunities: Array<Omit<ClientOpportunity, "id" | "createdAt" | "generatedByAgentId" | "status">> = [];
  for (const clientSub of clientSubscriptions) {
    const higherTier = orgSubscriptions
      .filter((s) => s.name === clientSub.name && s.clientId !== clientId && s.amount > clientSub.amount / UPSELL_GAP_RATIO)
      .sort((a, b) => b.amount - a.amount)[0];
    if (!higherTier) continue;

    opportunities.push({
      organizationId,
      clientId,
      kind: "UPSELL",
      title: `Upsell: ${clientSub.name} to a higher tier`,
      description: `This client's real "${clientSub.name}" subscription is ${clientSub.amount}, while at least one other client on the same plan name pays ${higherTier.amount}.`,
      estimatedValue: higherTier.amount - clientSub.amount,
      evidence: `Real Subscription.amount comparison: this client ${clientSub.amount} vs another real client on "${clientSub.name}" at ${higherTier.amount}.`,
      confidenceScore: 55,
    });
  }
  return opportunities;
}

const REFERRAL_SUGGESTION_TYPES = ["REFERRAL_REQUEST", "TESTIMONIAL", "GOOGLE_REVIEW", "LINKEDIN_RECOMMENDATION", "CASE_STUDY"] as const;

const ReferralSuggestionSchema = z.object({
  suggestedAction: z.enum(REFERRAL_SUGGESTION_TYPES),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1),
});

/**
 * Only generated for clients whose real, already-computed ClientHealthSnapshot
 * crosses REFERRAL_HEALTH_THRESHOLD — never a speculative ask to an
 * unhappy client. The one AI call is grounded strictly in the client's real
 * health factors.
 */
async function generateReferralOpportunity(
  clientId: string,
  organizationId: string,
): Promise<Omit<ClientOpportunity, "id" | "createdAt" | "generatedByAgentId" | "status"> | null> {
  const [snapshot, client] = await Promise.all([
    prisma.clientHealthSnapshot.findFirst({ where: { clientId }, orderBy: { date: "desc" } }),
    prisma.client.findUnique({ where: { id: clientId }, select: { name: true, createdAt: true } }),
  ]);
  if (!snapshot || snapshot.overallScore < REFERRAL_HEALTH_THRESHOLD || !client || !isAIConnected()) return null;

  const tenureDays = Math.round((Date.now() - client.createdAt.getTime()) / 86_400_000);
  const persona = getPersona("CEO");

  const result = await generateStructured({
    system: `${persona.systemPrompt}\n\nYou are identifying a referral opportunity for a real, healthy client. Ground your suggestion strictly in the real data given — never invent facts about this client.`,
    userContent: `Client "${client.name}" has a real overall health score of ${snapshot.overallScore}/100 (payment ${snapshot.paymentScore}, engagement ${snapshot.engagementScore}, delivery ${snapshot.deliveryScore}, contract ${snapshot.contractScore}), and has been a client for ${tenureDays} real days. Suggest ONE specific referral-style ask (referral request, testimonial, Google review, LinkedIn recommendation, or case study) that fits this relationship.`,
    maxTokens: 512,
    effort: "low",
    schema: ReferralSuggestionSchema,
  });
  await recordAIUsage(organizationId, result.provider, result.model, result.inputTokens, result.outputTokens, "clients:referral-suggestion");

  return {
    organizationId,
    clientId,
    kind: "REFERRAL",
    title: result.parsed.title,
    description: result.parsed.description,
    estimatedValue: null,
    evidence: `Real health score ${snapshot.overallScore}/100 (>= ${REFERRAL_HEALTH_THRESHOLD} threshold), client for ${tenureDays} real days.`,
    confidenceScore: snapshot.dataConfidence,
  };
}

/**
 * Generates and persists fresh Upsell/Cross-sell/Referral opportunities for
 * one client. Deterministic cross-sell/upsell always run; referral only
 * runs when the client's real health crosses the threshold and AI is
 * configured. Never overwrites/dismisses prior SUGGESTED rows — those are
 * left for a human to act on or dismiss; this only adds new ones, capped
 * per kind by the deterministic generators themselves.
 */
export async function generateClientOpportunities(clientId: string, organizationId: string): Promise<ClientOpportunity[]> {
  const [crossSell, upsell, referral] = await Promise.all([
    generateCrossSellOpportunities(clientId, organizationId),
    generateUpsellOpportunities(clientId, organizationId),
    generateReferralOpportunity(clientId, organizationId).catch(() => null),
  ]);

  const toCreate = [...crossSell, ...upsell, ...(referral ? [referral] : [])];
  if (toCreate.length === 0) return [];

  return prisma.$transaction(toCreate.map((data) => prisma.clientOpportunity.create({ data })));
}
