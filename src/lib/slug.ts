import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Converts an arbitrary name into a URL-safe slug: lowercase, ASCII
 * alphanumerics and hyphens only, no leading/trailing/duplicate hyphens.
 */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "") || "org";
}

function randomSuffix(length = 5): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return result;
}

/**
 * Generates a slug for a new Organization, appending a short random suffix
 * on collision against the unique `Organization.slug` column until a free
 * one is found.
 */
export async function generateUniqueOrgSlug(
  prisma: Pick<PrismaClient, "organization">,
  name: string,
): Promise<string> {
  const base = slugify(name);

  const existing = await prisma.organization.findUnique({ where: { slug: base } });
  if (!existing) return base;

  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = `${base}-${randomSuffix()}`;
    const collision = await prisma.organization.findUnique({ where: { slug: candidate } });
    if (!collision) return candidate;
  }

  // Extremely unlikely fallback — timestamp guarantees uniqueness.
  return `${base}-${Date.now().toString(36)}`;
}
