import PptxGenJS from "pptxgenjs";

import type { ReportBlueprint } from "./report-blueprint";
import type { DocumentChartData, DocumentTableData } from "@/lib/documents/blueprint";

const SLIDE_W = 13.33;
const SLIDE_H = 7.5;
const MARGIN = 0.5;
const BRAND_COLOR = "008254";
const BRAND_DARK = "020203";
const MUTED_COLOR = "8B9094";
const TEXT_COLOR = "1A1A1A";
const HEADER_FILL = "EAFAF1";
const BORDER_COLOR = "E5E7EB";

/** Best-effort logo fetch — a broken/unreachable logo URL must never break deck generation. */
async function fetchImageDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!/^image\//.test(contentType)) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

function addFooter(slide: PptxGenJS.Slide, footerText: string | undefined) {
  if (!footerText) return;
  slide.addText(footerText, {
    x: MARGIN,
    y: SLIDE_H - 0.4,
    w: SLIDE_W - MARGIN * 2,
    h: 0.3,
    fontSize: 8,
    color: MUTED_COLOR,
    align: "left",
  });
}

function addTitleSlide(pres: PptxGenJS, blueprint: ReportBlueprint, logo: string | null) {
  const slide = pres.addSlide();
  slide.background = { color: BRAND_DARK };

  if (logo) {
    try {
      slide.addImage({ data: logo, x: SLIDE_W / 2 - 0.6, y: 0.7, w: 1.2, h: 1.2 });
    } catch (err) {
      console.warn("pptx-renderer: failed to embed logo image", err);
    }
  }

  slide.addText(blueprint.brand.organizationName.toUpperCase(), {
    x: MARGIN,
    y: logo ? 2.2 : 1.6,
    w: SLIDE_W - MARGIN * 2,
    h: 0.4,
    align: "center",
    fontSize: 12,
    color: MUTED_COLOR,
    bold: true,
    charSpacing: 2,
  });

  slide.addText(blueprint.title, {
    x: MARGIN,
    y: logo ? 2.7 : 2.1,
    w: SLIDE_W - MARGIN * 2,
    h: 1.1,
    align: "center",
    fontSize: 32,
    color: "FFFFFF",
    bold: true,
  });

  if (blueprint.subtitle) {
    slide.addText(blueprint.subtitle, {
      x: MARGIN,
      y: logo ? 3.7 : 3.1,
      w: SLIDE_W - MARGIN * 2,
      h: 0.6,
      align: "center",
      fontSize: 15,
      color: MUTED_COLOR,
    });
  }

  const dateStr = (blueprint.generatedAt ?? new Date()).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  slide.addText(dateStr, {
    x: MARGIN,
    y: SLIDE_H - 0.7,
    w: SLIDE_W - MARGIN * 2,
    h: 0.3,
    align: "center",
    fontSize: 10,
    color: MUTED_COLOR,
  });

  slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: SLIDE_W, h: 0.08, fill: { color: BRAND_COLOR } });
}

function addSlideHeading(pres: PptxGenJS, slide: PptxGenJS.Slide, heading: string) {
  slide.addText(heading, {
    x: MARGIN,
    y: 0.35,
    w: SLIDE_W - MARGIN * 2,
    h: 0.6,
    fontSize: 22,
    bold: true,
    color: TEXT_COLOR,
  });
  slide.addShape(pres.ShapeType.rect, { x: MARGIN, y: 0.95, w: 0.6, h: 0.05, fill: { color: BRAND_COLOR } });
}

function buildTableRows(table: DocumentTableData): PptxGenJS.TableRow[] {
  const headerRow: PptxGenJS.TableRow = table.headers.map((header, i) => ({
    text: header,
    options: {
      bold: true,
      color: TEXT_COLOR,
      fill: { color: HEADER_FILL },
      align: table.alignRightColumns?.includes(i) ? "right" : "left",
      fontSize: 10,
    },
  }));

  const bodyRows: PptxGenJS.TableRow[] = table.rows.map((row) =>
    row.map((cell, i) => ({
      text: String(cell),
      options: {
        color: "333333",
        align: table.alignRightColumns?.includes(i) ? "right" : "left",
        fontSize: 9.5,
        border: { type: "solid", color: BORDER_COLOR, pt: 0.5 },
      },
    })),
  );

  return [headerRow, ...bodyRows];
}

function addTable(slide: PptxGenJS.Slide, table: DocumentTableData, opts: { x: number; y: number; w: number; h: number }) {
  try {
    const rows = buildTableRows(table);
    slide.addTable(rows, { ...opts, fontSize: 9.5, border: { type: "solid", color: BORDER_COLOR, pt: 0.5 }, autoPage: false });
  } catch (err) {
    console.warn("pptx-renderer: failed to render table, skipping", err);
  }
}

function addChart(pres: PptxGenJS, slide: PptxGenJS.Slide, heading: string, chart: DocumentChartData, opts: { x: number; y: number; w: number; h: number }) {
  try {
    const data: PptxGenJS.OptsChartData[] = [{ name: heading, labels: chart.labels, values: chart.values }];
    slide.addChart(pres.ChartType.bar, data, {
      ...opts,
      chartColors: [BRAND_COLOR],
      showLegend: false,
      showValue: true,
      dataLabelColor: TEXT_COLOR,
      catAxisLabelColor: MUTED_COLOR,
      valAxisLabelColor: MUTED_COLOR,
      dataLabelFormatCode: chart.valueSuffix ? `0"${chart.valueSuffix}"` : undefined,
    });
  } catch (err) {
    console.warn("pptx-renderer: failed to render chart, skipping", err);
  }
}

function addContentSlide(pres: PptxGenJS, blueprint: ReportBlueprint, section: ReportBlueprint["sections"][number]) {
  const slide = pres.addSlide();
  addSlideHeading(pres, slide, section.heading);

  let cursorY = 1.2;
  const contentW = SLIDE_W - MARGIN * 2;

  if (section.body) {
    slide.addText(section.body, {
      x: MARGIN,
      y: cursorY,
      w: contentW,
      h: 1.0,
      fontSize: 12,
      color: "2A2A2A",
      valign: "top",
      lineSpacingMultiple: 1.15,
    });
    cursorY += 1.1;
  }

  if (section.bullets?.length) {
    const bulletText: PptxGenJS.TextProps[] = section.bullets.map((bullet) => ({
      text: bullet,
      options: { bullet: { characterCode: "2022", indent: 18 }, fontSize: 12, color: "2A2A2A", breakLine: true },
    }));
    const bulletH = Math.min(2.2, 0.35 * section.bullets.length + 0.2);
    slide.addText(bulletText, { x: MARGIN, y: cursorY, w: contentW, h: bulletH, valign: "top" });
    cursorY += bulletH + 0.15;
  }

  const hasTable = !!section.table;
  const hasChart = !!section.chart;
  const areaTop = Math.max(cursorY, 2.2);
  const areaH = SLIDE_H - areaTop - 0.6;

  if (hasTable && hasChart && section.table && section.chart) {
    addTable(slide, section.table, { x: MARGIN, y: areaTop, w: contentW / 2 - 0.2, h: areaH });
    addChart(pres, slide, section.heading, section.chart, {
      x: MARGIN + contentW / 2 + 0.2,
      y: areaTop,
      w: contentW / 2 - 0.2,
      h: areaH,
    });
  } else if (hasTable && section.table) {
    addTable(slide, section.table, { x: MARGIN, y: areaTop, w: contentW, h: areaH });
  } else if (hasChart && section.chart) {
    addChart(pres, slide, section.heading, section.chart, { x: MARGIN, y: areaTop, w: contentW, h: areaH });
  }

  addFooter(slide, blueprint.footerText);
}

/**
 * Renders a ReportBlueprint to a branded .pptx deck: a title slide (brand
 * logo, org name, title/subtitle, generated date) followed by one slide
 * per section, with real editable tables/charts (not baked-in images). A
 * malformed table or chart on a single section is logged and skipped
 * rather than failing the whole export.
 */
export async function renderReportToPptx(blueprint: ReportBlueprint): Promise<Buffer> {
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE";
  pres.title = blueprint.title;
  pres.author = blueprint.brand.organizationName;

  const logo = blueprint.brand.logoUrl ? await fetchImageDataUri(blueprint.brand.logoUrl) : null;

  addTitleSlide(pres, blueprint, logo);

  for (const section of blueprint.sections) {
    addContentSlide(pres, blueprint, section);
  }

  const output = await pres.write({ outputType: "nodebuffer" });
  return output as Buffer;
}
