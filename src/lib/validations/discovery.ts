import { z } from "zod";

export const discoveryQuerySchema = z.string().trim().min(3, "Describe who you're looking for in a bit more detail.").max(300);

/**
 * The Lead Finder's advanced filters — with no purchased business-data
 * provider configured, these don't filter a pre-existing local dataset (none
 * exists); they're folded into the AI web-search query construction (see
 * buildDiscoveryPrompt in runWebSearchDiscovery). Every field is optional —
 * an empty filter set just means "no extra constraint."
 */
export const discoveryFiltersSchema = z.object({
  country: z.string().trim().max(100).optional().or(z.literal("")),
  state: z.string().trim().max(100).optional().or(z.literal("")),
  city: z.string().trim().max(100).optional().or(z.literal("")),
  industry: z.string().trim().max(100).optional().or(z.literal("")),
  companySize: z.string().trim().max(50).optional().or(z.literal("")),
  revenue: z.string().trim().max(50).optional().or(z.literal("")),
  employees: z.string().trim().max(50).optional().or(z.literal("")),
  technology: z.string().trim().max(200).optional().or(z.literal("")),
  keywords: z.string().trim().max(300).optional().or(z.literal("")),
  language: z.string().trim().max(50).optional().or(z.literal("")),
  growthRate: z.string().trim().max(50).optional().or(z.literal("")),
  funding: z.string().trim().max(50).optional().or(z.literal("")),
  foundedYear: z.string().trim().max(20).optional().or(z.literal("")),
  businessType: z.string().trim().max(50).optional().or(z.literal("")),
  remoteHybrid: z.string().trim().max(50).optional().or(z.literal("")),
  publicPrivate: z.string().trim().max(50).optional().or(z.literal("")),
});

export type DiscoveryFilters = z.infer<typeof discoveryFiltersSchema>;

export const FILTER_LABELS: Record<keyof DiscoveryFilters, string> = {
  country: "Country",
  state: "State",
  city: "City",
  industry: "Industry",
  companySize: "Company size",
  revenue: "Revenue",
  employees: "Employees",
  technology: "Technology",
  keywords: "Keywords",
  language: "Language",
  growthRate: "Growth rate",
  funding: "Funding",
  foundedYear: "Founded year",
  businessType: "Business type",
  remoteHybrid: "Remote/Hybrid",
  publicPrivate: "Public/Private",
};

/** Renders non-empty filters into a single natural-language clause the AI search prompt can append. */
export function describeFilters(filters: Partial<DiscoveryFilters>): string {
  const parts = (Object.keys(FILTER_LABELS) as Array<keyof DiscoveryFilters>)
    .map((key) => {
      const value = filters[key];
      return value ? `${FILTER_LABELS[key]}: ${value}` : null;
    })
    .filter((s): s is string => Boolean(s));
  return parts.join("; ");
}

export const discoveredCompanySchema = z.object({
  name: z.string().trim().min(1),
  website: z.string().trim().optional(),
  industry: z.string().trim().optional(),
  email: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  reason: z.string().trim().optional(),
});

export const discoveredCompanyListSchema = z.array(discoveredCompanySchema).max(15);

export type DiscoveredCompanyInput = z.infer<typeof discoveredCompanySchema>;
