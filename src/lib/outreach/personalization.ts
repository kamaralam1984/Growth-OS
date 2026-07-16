import { prisma } from "@/lib/prisma";

/**
 * Real-data-only grounding summary for AI email/LinkedIn generation — mirrors
 * src/lib/scanner/ai-report-generator.ts's buildScanSummary style exactly.
 * Every section either reports a real stored fact or honestly says "not
 * available yet" — never invents a pain point, tech detail, or company fact
 * that hasn't actually been researched.
 */
export async function buildContactContext(contactId: string): Promise<string> {
  const contact = await prisma.contact.findUniqueOrThrow({
    where: { id: contactId },
    include: {
      company: {
        include: {
          intelligenceRuns: { orderBy: { createdAt: "desc" }, take: 1 },
          websiteScans: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { opportunity: true },
          },
        },
      },
    },
  });

  const sections = [
    `Contact: ${contact.firstName} ${contact.lastName ?? ""}`.trim() + (contact.jobTitle ? `, ${contact.jobTitle}` : ""),
    contact.company ? `Company: ${contact.company.name}` : "Company: not linked to a known company yet.",
    contact.company?.industry ? `Industry: ${contact.company.industry}` : null,
    contact.company?.headquartersCity || contact.company?.headquartersCountry
      ? `Location: ${[contact.company?.headquartersCity, contact.company?.headquartersCountry].filter(Boolean).join(", ")}`
      : contact.country || contact.city
        ? `Location: ${[contact.city, contact.country].filter(Boolean).join(", ")}`
        : null,
    contact.company?.technologies && contact.company.technologies.length > 0
      ? `Known technology stack: ${contact.company.technologies.join(", ")}`
      : "Technology stack: not researched yet.",
  ];

  const intel = contact.company?.intelligenceRuns[0];
  if (intel) {
    sections.push(`Business summary (from AI Company Intelligence): ${intel.businessSummary}`);
    if (intel.potentialPainPoints.length > 0) sections.push(`Real researched pain points: ${intel.potentialPainPoints.join("; ")}`);
    if (intel.businessOpportunities.length > 0) sections.push(`Real researched business opportunities: ${intel.businessOpportunities.join("; ")}`);
  } else {
    sections.push("No AI Company Intelligence report exists yet for this company — no researched pain points available.");
  }

  const scan = contact.company?.websiteScans[0];
  if (scan?.opportunity) {
    sections.push(
      `Website Opportunity score: ${scan.opportunity.overallOpportunityScore}/100 (${scan.opportunity.band}). Digital maturity ${scan.opportunity.digitalScore}, automation opportunity ${scan.opportunity.automationScore}.`,
    );
  } else {
    sections.push("No Website Scanner report exists yet for this company — no opportunity score available.");
  }

  return sections.filter(Boolean).join("\n");
}
