import * as cheerio from "cheerio";

/** Real structural extraction from a fetched HTML document — every field below is a direct DOM fact, nothing inferred. */
export interface ParsedHeading {
  level: number;
  text: string;
}

export interface ParsedImage {
  src: string;
  alt: string | null;
}

export interface ParsedLink {
  href: string;
  isInternal: boolean;
  text: string;
}

export interface ParsedHtml {
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  hasOpenGraph: boolean;
  hasTwitterCard: boolean;
  hasSchema: boolean;
  viewportMetaPresent: boolean;
  metaGenerator: string | null;
  headings: ParsedHeading[];
  images: ParsedImage[];
  links: ParsedLink[];
  scriptSrcs: string[];
  scriptsWithoutAsyncOrDefer: number;
  stylesheetHrefs: string[];
  inlineStyleCss: string;
  formCount: number;
  navPresent: boolean;
  visibleText: string;
  rawHtml: string;
}

export function parseHtml(html: string, baseUrl: string): ParsedHtml {
  const $ = cheerio.load(html);
  const base = new URL(baseUrl);

  const headings: ParsedHeading[] = [];
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    const tag = $(el).prop("tagName")?.toLowerCase() ?? "h6";
    const level = Number(tag.replace(/[^0-9]/g, "")) || 6;
    headings.push({ level, text: $(el).text().trim().slice(0, 200) });
  });

  const images: ParsedImage[] = [];
  $("img").each((_, el) => {
    const src = $(el).attr("src");
    if (!src) return;
    images.push({ src, alt: $(el).attr("alt") ?? null });
  });

  const links: ParsedLink[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
    let isInternal = true;
    try {
      const resolved = new URL(href, base);
      isInternal = resolved.hostname === base.hostname;
    } catch {
      isInternal = true;
    }
    links.push({ href, isInternal, text: $(el).text().trim().slice(0, 120) });
  });

  const scriptSrcs: string[] = [];
  let scriptsWithoutAsyncOrDefer = 0;
  $("script[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (!src) return;
    scriptSrcs.push(src);
    const inHead = $(el).parents("head").length > 0;
    const hasAsyncOrDefer = $(el).attr("async") !== undefined || $(el).attr("defer") !== undefined;
    if (inHead && !hasAsyncOrDefer) scriptsWithoutAsyncOrDefer++;
  });

  const stylesheetHrefs: string[] = [];
  $("link[rel=stylesheet]").each((_, el) => {
    const href = $(el).attr("href");
    if (href) stylesheetHrefs.push(href);
  });

  const inlineStyleCss = $("style")
    .map((_, el) => $(el).text())
    .get()
    .join("\n")
    .slice(0, 50_000);

  $("script, style, noscript").remove();
  const visibleText = $("body").text().replace(/\s+/g, " ").trim();

  return {
    title: $("title").first().text().trim() || null,
    metaDescription: $('meta[name="description"]').attr("content")?.trim() || null,
    canonical: $('link[rel="canonical"]').attr("href") || null,
    hasOpenGraph: $('meta[property^="og:"]').length > 0,
    hasTwitterCard: $('meta[name^="twitter:"]').length > 0,
    hasSchema: $('script[type="application/ld+json"]').length > 0 || $("[itemscope]").length > 0,
    viewportMetaPresent: $('meta[name="viewport"]').length > 0,
    metaGenerator: $('meta[name="generator"]').attr("content") || null,
    headings,
    images,
    links,
    scriptSrcs,
    scriptsWithoutAsyncOrDefer,
    stylesheetHrefs,
    inlineStyleCss,
    formCount: $("form").length,
    navPresent: $("nav").length > 0 || $('[role="navigation"]').length > 0,
    visibleText,
    rawHtml: html,
  };
}
