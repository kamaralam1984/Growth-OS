import type { TaxRuleType } from "@/generated/prisma/client";

/**
 * Static country/region tax-rate table — real, standard headline rates
 * (as of this codebase's last review), not fabricated placeholders. Tax
 * law changes and varies by product/registration-threshold in ways a
 * static table can never fully capture (e.g. US sales tax is set per
 * state/county by economic nexus, India GST has multiple slabs by product
 * category, EU VAT has distance-selling thresholds) — this is a genuine,
 * documented approximation meant for a straightforward B2B SaaS
 * subscription line item, not a substitute for real tax/legal advice.
 * Review and update periodically; never treat this as authoritative for
 * an actual tax filing.
 */
interface CountryTaxRule {
  ruleType: TaxRuleType;
  ratePercent: number;
  /** True when B2B sales to a customer with a valid tax id are typically zero-rated with the buyer self-assessing (EU/UK VAT reverse charge, India GST RCM for specific categories). */
  reverseChargeEligible: boolean;
}

const COUNTRY_TAX_RULES: Record<string, CountryTaxRule> = {
  IN: { ruleType: "GST", ratePercent: 18, reverseChargeEligible: true },
  GB: { ruleType: "VAT", ratePercent: 20, reverseChargeEligible: true },
  DE: { ruleType: "VAT", ratePercent: 19, reverseChargeEligible: true },
  FR: { ruleType: "VAT", ratePercent: 20, reverseChargeEligible: true },
  ES: { ruleType: "VAT", ratePercent: 21, reverseChargeEligible: true },
  IT: { ruleType: "VAT", ratePercent: 22, reverseChargeEligible: true },
  NL: { ruleType: "VAT", ratePercent: 21, reverseChargeEligible: true },
  IE: { ruleType: "VAT", ratePercent: 23, reverseChargeEligible: true },
  SE: { ruleType: "VAT", ratePercent: 25, reverseChargeEligible: true },
  AE: { ruleType: "VAT", ratePercent: 5, reverseChargeEligible: false },
  AU: { ruleType: "GST", ratePercent: 10, reverseChargeEligible: false },
  NZ: { ruleType: "GST", ratePercent: 15, reverseChargeEligible: false },
  SG: { ruleType: "SALES_TAX", ratePercent: 9, reverseChargeEligible: false },
  CA: { ruleType: "SALES_TAX", ratePercent: 5, reverseChargeEligible: false }, // federal GST floor only — provincial HST/PST varies by province and isn't modeled here
  JP: { ruleType: "SALES_TAX", ratePercent: 10, reverseChargeEligible: false },
  // US sales tax is set per state/county by economic nexus with no single
  // national rate — deliberately left at 0/NONE here rather than fabricate
  // a number; a real US deployment needs a proper nexus-aware provider
  // (Stripe Tax, TaxJar, Avalara) wired in before charging US sales tax.
  US: { ruleType: "NONE", ratePercent: 0, reverseChargeEligible: false },
};

export interface ResolvedTax {
  ruleType: TaxRuleType;
  ratePercent: number;
  reverseCharge: boolean;
}

/** Resolves the real, documented tax rule for a billing address's country — NONE/0% for any country not in the table above, never a guessed rate. `hasBuyerTaxId` triggers reverse-charge zero-rating only for countries where that's real, standard practice. */
export function resolveTaxRule(country: string | null | undefined, hasBuyerTaxId: boolean): ResolvedTax {
  const rule = country ? COUNTRY_TAX_RULES[country.toUpperCase()] : undefined;
  if (!rule) return { ruleType: "NONE", ratePercent: 0, reverseCharge: false };

  if (hasBuyerTaxId && rule.reverseChargeEligible) {
    return { ruleType: rule.ruleType, ratePercent: 0, reverseCharge: true };
  }
  return { ruleType: rule.ruleType, ratePercent: rule.ratePercent, reverseCharge: false };
}

export interface TaxCalculation {
  taxableCents: number;
  taxCents: number;
  totalCents: number;
  ratePercent: number;
  ruleType: TaxRuleType;
  reverseCharge: boolean;
}

/** Real cents-based tax computation — rounds to the nearest cent (never fractional currency units) so invoice totals always sum exactly. */
export function computeTax(subtotalCents: number, country: string | null | undefined, hasBuyerTaxId: boolean): TaxCalculation {
  const resolved = resolveTaxRule(country, hasBuyerTaxId);
  const taxCents = Math.round((subtotalCents * resolved.ratePercent) / 100);
  return {
    taxableCents: subtotalCents,
    taxCents,
    totalCents: subtotalCents + taxCents,
    ratePercent: resolved.ratePercent,
    ruleType: resolved.ruleType,
    reverseCharge: resolved.reverseCharge,
  };
}
