import PDFDocument from "pdfkit";

import type { DocumentChartData, DocumentTableData } from "@/lib/documents/blueprint";
import type { ReportBlueprint } from "./report-blueprint";

const MARGIN = 50;
const PAGE_SIZE = "LETTER";
const BRAND_COLOR = "#e11d48";
const MUTED_COLOR = "#666666";
const TEXT_COLOR = "#1a1a1a";

function collectPdfBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

/** Best-effort logo fetch — a broken/unreachable logo URL must never break deck generation. */
async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!/^image\//.test(contentType)) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function drawTable(doc: PDFKit.PDFDocument, table: DocumentTableData) {
  const usableWidth = doc.page.width - MARGIN * 2;
  const colCount = table.headers.length;
  const colWidth = usableWidth / colCount;
  const rowHeight = 26;

  function drawRow(cells: Array<string | number>, opts: { header?: boolean } = {}) {
    if (doc.y + rowHeight > doc.page.height - MARGIN) {
      doc.addPage();
    }
    const startY = doc.y;
    doc.font(opts.header ? "Helvetica-Bold" : "Helvetica").fontSize(10);
    if (opts.header) {
      doc.rect(MARGIN, startY, usableWidth, rowHeight).fill("#f3f4f6");
    }
    doc.fillColor(opts.header ? TEXT_COLOR : "#333333");
    cells.forEach((cell, i) => {
      const align = table.alignRightColumns?.includes(i) ? "right" : "left";
      doc.text(String(cell), MARGIN + i * colWidth + 6, startY + 8, { width: colWidth - 12, align });
    });
    doc.fillColor(TEXT_COLOR);
    doc.moveTo(MARGIN, startY + rowHeight).lineTo(MARGIN + usableWidth, startY + rowHeight).strokeColor("#e5e7eb").stroke();
    doc.y = startY + rowHeight;
  }

  drawRow(table.headers, { header: true });
  for (const row of table.rows) drawRow(row);
  doc.moveDown(1);
}

/** A real vector-drawn vertical bar chart — no external charting library, no rasterized image. */
function drawBarChart(doc: PDFKit.PDFDocument, chart: DocumentChartData) {
  const usableWidth = doc.page.width - MARGIN * 2;
  const chartHeight = 220;
  const max = Math.max(1, ...chart.values);
  const barCount = chart.labels.length;
  const gap = 16;
  const barWidth = Math.max(14, (usableWidth - gap * (barCount - 1)) / barCount);

  if (doc.y + chartHeight + 30 > doc.page.height - MARGIN) doc.addPage();
  const top = doc.y;

  doc.strokeColor("#e5e7eb").moveTo(MARGIN, top + chartHeight).lineTo(MARGIN + usableWidth, top + chartHeight).stroke();

  chart.values.forEach((value, i) => {
    const barHeight = (value / max) * (chartHeight - 24);
    const x = MARGIN + i * (barWidth + gap);
    const y = top + chartHeight - barHeight;
    doc.rect(x, y, barWidth, barHeight).fill(BRAND_COLOR);
    doc.fillColor(TEXT_COLOR).font("Helvetica").fontSize(9).text(
      `${value}${chart.valueSuffix ?? ""}`,
      x,
      y - 14,
      { width: barWidth, align: "center" },
    );
    doc.fillColor(MUTED_COLOR).fontSize(8.5).text(chart.labels[i] ?? "", x, top + chartHeight + 8, { width: barWidth, align: "center" });
  });

  doc.fillColor(TEXT_COLOR);
  doc.y = top + chartHeight + 28;
}

function renderTitleSlide(doc: PDFKit.PDFDocument, blueprint: ReportBlueprint, logo: Buffer | null) {
  const centerX = doc.page.width / 2;

  doc.rect(0, 0, doc.page.width, 10).fill(BRAND_COLOR);
  doc.fillColor(TEXT_COLOR);

  let y = 90;
  if (logo) {
    try {
      doc.image(logo, centerX - 45, y, { fit: [90, 90] });
      y += 110;
    } catch {
      // Corrupt/unsupported image data — skip the logo, never fail the deck.
    }
  }

  doc.font("Helvetica-Bold").fontSize(12).fillColor(MUTED_COLOR).text(blueprint.brand.organizationName.toUpperCase(), MARGIN, y, {
    align: "center",
    width: doc.page.width - MARGIN * 2,
  });
  y = doc.y + 46;

  doc.font("Helvetica-Bold").fontSize(34).fillColor(TEXT_COLOR).text(blueprint.title, MARGIN, y, {
    align: "center",
    width: doc.page.width - MARGIN * 2,
  });
  if (blueprint.subtitle) {
    doc.moveDown(0.6);
    doc.font("Helvetica").fontSize(15).fillColor(MUTED_COLOR).text(blueprint.subtitle, { align: "center" });
  }

  const dateStr = (blueprint.generatedAt ?? new Date()).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  doc.font("Helvetica").fontSize(9).fillColor(MUTED_COLOR).text(dateStr, MARGIN, doc.page.height - MARGIN - 20, {
    align: "center",
    width: doc.page.width - MARGIN * 2,
  });
}

function renderSlideHeading(doc: PDFKit.PDFDocument, text: string) {
  doc.font("Helvetica-Bold").fontSize(26).fillColor(TEXT_COLOR).text(text, MARGIN, MARGIN);
  doc.moveTo(MARGIN, doc.y + 8).lineTo(MARGIN + 80, doc.y + 8).lineWidth(4).strokeColor(BRAND_COLOR).stroke();
  doc.lineWidth(1);
  doc.y = doc.y + 8 + 30;
  doc.x = MARGIN;
}

/**
 * Renders a ReportBlueprint as a landscape "board deck" PDF: one wide title
 * slide followed by one slide per section, drawn with generous whitespace
 * rather than the dense document layout of renderDocumentToPdf. Reuses that
 * renderer's low-level table/chart drawing and buffer-collection patterns,
 * adapted to the wider landscape page.
 */
export async function renderReportToPdfDeck(blueprint: ReportBlueprint): Promise<Buffer> {
  const doc = new PDFDocument({ size: PAGE_SIZE, layout: "landscape", margin: MARGIN, bufferPages: true });
  const bufferPromise = collectPdfBuffer(doc);

  const logo = blueprint.brand.logoUrl ? await fetchImageBuffer(blueprint.brand.logoUrl) : null;

  renderTitleSlide(doc, blueprint, logo);

  for (const section of blueprint.sections) {
    doc.addPage();
    renderSlideHeading(doc, section.heading);

    if (section.body) {
      for (const paragraph of section.body.split(/\n\n+/)) {
        doc.font("Helvetica").fontSize(13).fillColor("#2a2a2a").text(paragraph.trim(), { align: "left", lineGap: 5 });
        doc.moveDown(0.8);
      }
    }
    if (section.bullets?.length) {
      doc.font("Helvetica").fontSize(13).fillColor("#2a2a2a");
      for (const bullet of section.bullets) {
        doc.text(`•  ${bullet}`, { indent: 12, lineGap: 5 });
      }
      doc.moveDown(0.8);
    }
    if (section.table) drawTable(doc, section.table);
    if (section.chart) drawBarChart(doc, section.chart);
  }

  // Revisiting already-laid-out pages to stamp a footer: pdfkit's .text()
  // auto-paginates whenever it thinks content would overflow the bottom
  // margin, which — since we're deliberately drawing inside that margin —
  // spuriously appends blank pages unless the bottom margin is widened to 0
  // for the duration of this stamp-only pass. The title slide (page 0) is
  // left untouched.
  if (blueprint.footerText) {
    const range = doc.bufferedPageRange();
    for (let i = 1; i < range.count; i++) {
      doc.switchToPage(i);
      const savedBottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;

      const footerY = doc.page.height - MARGIN + 14;
      doc.font("Helvetica").fontSize(8).fillColor(MUTED_COLOR).text(blueprint.footerText, MARGIN, footerY, {
        width: doc.page.width - MARGIN * 2,
        align: "left",
        lineBreak: false,
      });

      doc.page.margins.bottom = savedBottomMargin;
    }
  }

  doc.end();
  return bufferPromise;
}
