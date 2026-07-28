/**
 * Deterministic Opportunity Score — a documented weighted combination of the
 * 4 real audit scores plus real signals (technology count, optional
 * employee-count hint), same philosophy as lead-scoring.ts: fast, cheap,
 * transparent formula, never a per-scan AI call for the score itself. Every
 * number below traces to a comment explaining the judgment call.
 */

export type OpportunityBand = "HIGH" | "MEDIUM" | "LOW";
export type ConfidenceLevel = "LOW" | "MEDIUM" | "HIGH";

export interface OpportunityInput {
  seoScore: number;
  performanceScore: number;
  securityScore: number;
  uxScore: number;
  technologiesCount: number;
  employeeCountHint?: number | null;
  // Real RDAP-derived domain age (src/lib/scanner/domain-info.ts) — null when
  // the lookup failed/wasn't available, never guessed.
  domainAgeDays?: number | null;
}

export interface OpportunityComputation {
  digitalScore: number;
  automationScore: number;
  growthScore: number;
  aiReadinessScore: number;
  overallOpportunityScore: number;
  band: OpportunityBand;
  estimatedValueMin: number;
  estimatedValueMax: number;
  estimatedTimeline: string;
  confidenceLevel: ConfidenceLevel;
}

export function computeOpportunity(input: OpportunityInput): OpportunityComputation {
  const { seoScore, performanceScore, securityScore, uxScore, technologiesCount, employeeCountHint, domainAgeDays } = input;

  // Digital maturity — how well the current site is built, averaged across the 3 UX-facing dimensions.
  const digitalScore = Math.round((seoScore + performanceScore + uxScore) / 3);

  // Automation opportunity is the INVERSE of digital maturity — a poorly
  // digitized site represents MORE opportunity, not less. 0.6 weight keeps a
  // well-built site from scoring literally 0 (there's always some opportunity).
  const automationScore = Math.max(0, Math.min(100, Math.round(100 - digitalScore * 0.6)));

  // Growth signal — a modern security/performance posture correlates with
  // active technical investment, itself a proxy for business growth.
  const growthScore = Math.round((securityScore + performanceScore) / 2);

  // AI readiness — more detected real technologies (a modern, API-capable
  // stack) means more real integration surface area for AI features.
  const aiReadinessScore = Math.max(0, Math.min(100, Math.round(30 + technologiesCount * 8)));

  const overallOpportunityScore = Math.round(
    digitalScore * 0.25 + automationScore * 0.3 + growthScore * 0.2 + aiReadinessScore * 0.15 + securityScore * 0.1,
  );
  const band: OpportunityBand = overallOpportunityScore >= 65 ? "HIGH" : overallOpportunityScore >= 35 ? "MEDIUM" : "LOW";

  // Estimated project value — documented tiers by opportunity band, scaled by
  // an optional employee-count hint the user supplied. Never a quotation —
  // the UI must always show that disclaimer alongside these numbers.
  const sizeMultiplier = employeeCountHint ? (employeeCountHint > 500 ? 2.5 : employeeCountHint > 100 ? 1.6 : employeeCountHint > 20 ? 1.2 : 1) : 1;

  let estimatedValueMin: number;
  let estimatedValueMax: number;
  let estimatedTimeline: string;
  if (overallOpportunityScore >= 65) {
    estimatedValueMin = Math.round(40_000 * sizeMultiplier);
    estimatedValueMax = Math.round(150_000 * sizeMultiplier);
    estimatedTimeline = "12–24 weeks";
  } else if (overallOpportunityScore >= 35) {
    estimatedValueMin = Math.round(15_000 * sizeMultiplier);
    estimatedValueMax = Math.round(50_000 * sizeMultiplier);
    estimatedTimeline = "6–12 weeks";
  } else {
    estimatedValueMin = Math.round(5_000 * sizeMultiplier);
    estimatedValueMax = Math.round(20_000 * sizeMultiplier);
    estimatedTimeline = "3–6 weeks";
  }

  // Confidence is never HIGH from static analysis alone — reserved for when
  // real business-size data is on file. Documented honest-neutral judgment
  // call, same spirit as lead-scoring.ts's NEUTRAL fallback. A domain
  // registered under 30 days ago (real RDAP fact, not a guess) overrides any
  // employee-count hint back down to LOW — too little real history exists
  // yet for even a MEDIUM-confidence estimate to be honest.
  const isFreshDomain = typeof domainAgeDays === "number" && domainAgeDays < 30;
  const confidenceLevel: ConfidenceLevel = isFreshDomain ? "LOW" : employeeCountHint ? "MEDIUM" : "LOW";

  return {
    digitalScore,
    automationScore,
    growthScore,
    aiReadinessScore,
    overallOpportunityScore,
    band,
    estimatedValueMin,
    estimatedValueMax,
    estimatedTimeline,
    confidenceLevel,
  };
}
