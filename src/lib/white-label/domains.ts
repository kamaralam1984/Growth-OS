import { randomBytes } from "node:crypto";
import { resolveTxt } from "node:dns/promises";

import { prisma } from "@/lib/prisma";
import type { CustomDomain } from "@/generated/prisma/client";
import { addCustomDomainSchema } from "@/lib/validations/white-label";

/**
 * Real domain-verification convention: same shape as Vercel/Netlify's own
 * TXT-record ownership check. The org proves control of `<domain>` by
 * publishing a TXT record at `_kvlgrowthos-verify.<domain>` whose value
 * equals the random token we generated for it.
 */
const VERIFICATION_SUBDOMAIN_PREFIX = "_kvlgrowthos-verify";

export function verificationRecordName(domain: string): string {
  return `${VERIFICATION_SUBDOMAIN_PREFIX}.${domain}`;
}

/** Real, syntactically-validated custom domain creation — generates a real random verification token and creates the row PENDING. Ensures a WhiteLabelSettings row exists for the org first (a custom domain always hangs off one). */
export async function addCustomDomain(organizationId: string, domain: string): Promise<CustomDomain> {
  const parsed = addCustomDomainSchema.parse({ domain });

  const settings = await prisma.whiteLabelSettings.upsert({
    where: { organizationId },
    create: { organizationId },
    update: {},
  });

  const verificationToken = randomBytes(16).toString("hex");

  try {
    return await prisma.customDomain.create({
      data: {
        whiteLabelSettingsId: settings.id,
        domain: parsed.domain,
        verificationToken,
        status: "PENDING",
      },
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
      throw new Error(`"${parsed.domain}" is already registered to an organization on this platform.`);
    }
    throw error;
  }
}

/**
 * Real DNS verification via Node's built-in dns/promises — resolves TXT
 * records for `_kvlgrowthos-verify.<domain>` and checks whether any of
 * them matches the stored verificationToken exactly. Never fakes a
 * "verified" result: a DNS error (NXDOMAIN, no TXT record yet, timeout)
 * always comes back as `verified: false` with the real reason, and the
 * domain's status is left PENDING rather than flipped to FAILED — an org
 * that hasn't gotten around to publishing the record yet is not "failed",
 * just not-yet-verified, and the honest choice is to let them keep
 * retrying "Verify now" for as long as it takes rather than track a
 * separate failure-count/backoff scheme this feature doesn't need yet.
 */
export async function verifyCustomDomain(domainId: string): Promise<{ verified: boolean; detail: string }> {
  const domain = await prisma.customDomain.findUnique({ where: { id: domainId } });
  if (!domain) {
    return { verified: false, detail: "Domain not found." };
  }
  if (domain.status === "VERIFIED") {
    return { verified: true, detail: "Already verified." };
  }

  const recordName = verificationRecordName(domain.domain);

  try {
    const records = await resolveTxt(recordName);
    const values = records.map((chunks) => chunks.join(""));
    const matched = values.some((value) => value.trim() === domain.verificationToken);

    if (matched) {
      await prisma.customDomain.update({
        where: { id: domainId },
        data: { status: "VERIFIED", verifiedAt: new Date() },
      });
      return { verified: true, detail: `Found a matching TXT record at ${recordName}.` };
    }

    return {
      verified: false,
      detail:
        values.length > 0
          ? `Found ${values.length} TXT record(s) at ${recordName}, but none matched the expected verification token. Double-check the value and try again.`
          : `No TXT records found at ${recordName} yet.`,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { verified: false, detail: `Could not resolve TXT records for ${recordName}: ${reason}` };
  }
}

/** Org-scoped delete — silently no-ops if the domain doesn't exist or belongs to a different org, so a caller never learns whether a given id belongs to someone else's organization. */
export async function removeCustomDomain(domainId: string, organizationId: string): Promise<void> {
  const domain = await prisma.customDomain.findUnique({
    where: { id: domainId },
    include: { whiteLabelSettings: true },
  });
  if (!domain || domain.whiteLabelSettings.organizationId !== organizationId) return;

  await prisma.customDomain.delete({ where: { id: domainId } });
}

/** Org-scoped list — empty until the org has ever created a WhiteLabelSettings row (e.g. by adding its first domain or saving brand settings). */
export async function listCustomDomains(organizationId: string): Promise<CustomDomain[]> {
  const settings = await prisma.whiteLabelSettings.findUnique({ where: { organizationId } });
  if (!settings) return [];

  return prisma.customDomain.findMany({
    where: { whiteLabelSettingsId: settings.id },
    orderBy: { createdAt: "desc" },
  });
}
