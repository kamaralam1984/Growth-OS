/**
 * Real WCAG 2.x contrast-ratio math (standard relative-luminance formula)
 * applied to color/background-color pairs actually declared in the site's
 * own CSS (inline <style> blocks + the first same-origin external
 * stylesheet). This is a genuine, deterministic computation on real
 * declared values — but it is a heuristic, not a full browser cascade
 * resolution: it does not resolve specificity, inheritance, CSS variables,
 * or computed styles the way a rendered DOM would. Findings are worded to
 * reflect that honestly ("declared colors", not "rendered contrast").
 */

export interface ColorPair {
  selector: string;
  color: string;
  background: string;
  ratio: number;
}

/** Exported for reuse by browser-metrics.ts, which parses real getComputedStyle() rgb()/rgba() output from a rendered page rather than raw declared CSS text. */
export function parseColor(value: string): [number, number, number] | null {
  const v = value.trim().toLowerCase();

  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const h = hex[1];
    if (h.length === 3) {
      return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
    }
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  const rgb = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)$/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];

  const NAMED: Record<string, [number, number, number]> = {
    white: [255, 255, 255],
    black: [0, 0, 0],
    red: [255, 0, 0],
    blue: [0, 0, 255],
    green: [0, 128, 0],
    gray: [128, 128, 128],
    grey: [128, 128, 128],
    transparent: [255, 255, 255],
  };
  if (v in NAMED) return NAMED[v];

  return null;
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const cs = c / 255;
    return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function contrastRatio(rgb1: [number, number, number], rgb2: [number, number, number]): number {
  const l1 = relativeLuminance(rgb1);
  const l2 = relativeLuminance(rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
}

/**
 * Scans CSS text for rule blocks that declare both `color` and
 * `background`/`background-color` together, preferring body/global text
 * selectors. Returns the first usable pair found — a deliberately simple
 * "best guess at the site's primary text/background pair," not an
 * exhaustive per-element audit.
 */
export function findPrimaryTextContrastPair(css: string): ColorPair | null {
  const ruleRegex = /([^{}]+)\{([^{}]*)\}/g;
  const candidates: ColorPair[] = [];
  let match: RegExpExecArray | null;

  while ((match = ruleRegex.exec(css)) !== null) {
    const selector = match[1].trim().slice(0, 100);
    const body = match[2];
    const colorMatch = body.match(/(?<!background-)(?<!border-)\bcolor\s*:\s*([^;]+);?/i);
    const bgMatch = body.match(/background(?:-color)?\s*:\s*([^;]+);?/i);
    if (!colorMatch || !bgMatch) continue;

    const color = parseColor(colorMatch[1]);
    const background = parseColor(bgMatch[1]);
    if (!color || !background) continue;

    candidates.push({ selector, color: colorMatch[1].trim(), background: bgMatch[1].trim(), ratio: contrastRatio(color, background) });
  }

  if (candidates.length === 0) return null;

  const priority = ["body", "html", "p", ":root", "main", "article"];
  const preferred = candidates.find((c) => priority.some((p) => c.selector.toLowerCase().split(",").some((s) => s.trim() === p)));
  return preferred ?? candidates[0];
}
