import * as cheerio from "cheerio";

import type { CrawledPage } from "./crawler";

/**
 * Deterministic brand/contact/media extraction (Step 2) — no AI call here at all.
 * Every field is a direct DOM/text fact read from the org's own crawled pages, or
 * `null` when genuinely not found. This is what the review UI renders in the
 * "Verified" bucket, distinct from the AI-inferred fields elsewhere in the pipeline.
 */

export interface BrandAssets {
  logoUrl: string | null;
  colors: string[];
  socialLinks: {
    facebook?: string;
    twitter?: string;
    linkedin?: string;
    instagram?: string;
    youtube?: string;
  };
  contactEmail: string | null;
  contactPhone: string | null;
  businessHours: string | null;
}

const SOCIAL_DOMAIN_PATTERNS: Array<[keyof BrandAssets["socialLinks"], RegExp]> = [
  ["facebook", /facebook\.com/i],
  ["twitter", /(?:twitter|x)\.com/i],
  ["linkedin", /linkedin\.com/i],
  ["instagram", /instagram\.com/i],
  ["youtube", /youtube\.com/i],
];

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_REGEX = /(\+?\d[\d\s().-]{7,}\d)/;
const COLOR_HEX_REGEX = /#[0-9a-fA-F]{3,8}\b/g;
const HOURS_REGEX = /(mon|tue|wed|thu|fri|sat|sun)[a-z]*\s*[-–—]?\s*(mon|tue|wed|thu|fri|sat|sun)?[a-z]*\s*[:\-]?\s*\d{1,2}(:\d{2})?\s*(am|pm)?\s*[-–—]\s*\d{1,2}(:\d{2})?\s*(am|pm)/i;

export function extractBrandAssets(pages: CrawledPage[]): BrandAssets {
  if (pages.length === 0) {
    return { logoUrl: null, colors: [], socialLinks: {}, contactEmail: null, contactPhone: null, businessHours: null };
  }

  const home = pages.find((p) => p.pageType === "home") ?? pages[0];
  const contactPage = pages.find((p) => p.pageType === "contact");

  let logoUrl: string | null = null;
  const colorCounts = new Map<string, number>();
  const socialLinks: BrandAssets["socialLinks"] = {};

  for (const page of pages) {
    const $ = cheerio.load(page.parsed.rawHtml);
    let base: URL;
    try {
      base = new URL(page.url);
    } catch {
      continue;
    }

    if (!logoUrl) {
      const imgLogo = $('img[src*="logo" i], img[alt*="logo" i], img[class*="logo" i]').first().attr("src");
      const iconHref = $('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').first().attr("href");
      const ogImage = $('meta[property="og:image"]').attr("content");
      const raw = imgLogo || iconHref || ogImage;
      if (raw) {
        try {
          logoUrl = new URL(raw, base).toString();
        } catch {
          // leave null — never guess a malformed URL into something fabricated
        }
      }
    }

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      for (const [key, pattern] of SOCIAL_DOMAIN_PATTERNS) {
        if (!socialLinks[key] && pattern.test(href)) socialLinks[key] = href;
      }
    });

    $("style").each((_, el) => {
      for (const match of $(el).text().match(COLOR_HEX_REGEX) ?? []) {
        const hex = match.toLowerCase();
        colorCounts.set(hex, (colorCounts.get(hex) ?? 0) + 1);
      }
    });
  }

  // Most-frequent colors first — a cheap but honest proxy for "brand" colors vs.
  // one-off decorative ones; capped at 6 so this stays a palette, not a dump.
  const colors = [...colorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([hex]) => hex);

  const textSource = (contactPage ?? home).parsed.visibleText;
  const emailMatch = textSource.match(EMAIL_REGEX);
  const phoneMatch = textSource.match(PHONE_REGEX);
  const hoursMatch = textSource.match(HOURS_REGEX);

  return {
    logoUrl,
    colors,
    socialLinks,
    contactEmail: emailMatch ? emailMatch[0] : null,
    contactPhone: phoneMatch ? phoneMatch[0].trim() : null,
    businessHours: hoursMatch ? hoursMatch[0].trim() : null,
  };
}
