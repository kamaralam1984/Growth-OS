import PDFDocument from "pdfkit";

import type { DocumentBlueprint, DocumentTableData, DocumentChartData } from "./blueprint";

const MARGIN = 50;
const PAGE_SIZE = "A4";
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

/** Best-effort logo fetch — a broken/unreachable logo URL must never break document generation. */
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
  const rowHeight = 22;

  function drawRow(cells: Array<string | number>, opts: { header?: boolean } = {}) {
    if (doc.y + rowHeight > doc.page.height - MARGIN) {
      doc.addPage();
    }
    const startY = doc.y;
    doc.font(opts.header ? "Helvetica-Bold" : "Helvetica").fontSize(9);
    if (opts.header) {
      doc.rect(MARGIN, startY, usableWidth, rowHeight).fill("#f3f4f6");
    }
    doc.fillColor(opts.header ? TEXT_COLOR : "#333333");
    cells.forEach((cell, i) => {
      const align = table.alignRightColumns?.includes(i) ? "right" : "left";
      doc.text(String(cell), MARGIN + i * colWidth + 4, startY + 6, { width: colWidth - 8, align });
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
  const chartHeight = 160;
  const chartTop = doc.y;
  const max = Math.max(1, ...chart.values);
  const barCount = chart.labels.length;
  const gap = 12;
  const barWidth = Math.max(10, (usableWidth - gap * (barCount - 1)) / barCount);

  if (chartTop + chartHeight + 30 > doc.page.height - MARGIN) doc.addPage();
  const top = doc.y;

  doc.strokeColor("#e5e7eb").moveTo(MARGIN, top + chartHeight).lineTo(MARGIN + usableWidth, top + chartHeight).stroke();

  chart.values.forEach((value, i) => {
    const barHeight = (value / max) * (chartHeight - 20);
    const x = MARGIN + i * (barWidth + gap);
    const y = top + chartHeight - barHeight;
    doc.rect(x, y, barWidth, barHeight).fill(BRAND_COLOR);
    doc.fillColor(TEXT_COLOR).font("Helvetica").fontSize(8).text(
      `${value}${chart.valueSuffix ?? ""}`,
      x,
      y - 12,
      { width: barWidth, align: "center" },
    );
    doc.fillColor(MUTED_COLOR).fontSize(7.5).text(chart.labels[i] ?? "", x, top + chartHeight + 6, { width: barWidth, align: "center" });
  });

  doc.fillColor(TEXT_COLOR);
  doc.y = top + chartHeight + 24;
}

function renderCover(doc: PDFKit.PDFDocument, blueprint: DocumentBlueprint, logo: Buffer | null) {
  const centerX = doc.page.width / 2;

  doc.rect(0, 0, doc.page.width, 10).fill(BRAND_COLOR);
  doc.fillColor(TEXT_COLOR);

  let y = 100;
  if (logo) {
    try {
      doc.image(logo, centerX - 40, y, { fit: [80, 80] });
      y += 100;
    } catch {
      // Corrupt/unsupported image data — skip the logo, never fail the document.
    }
  }

  doc.font("Helvetica-Bold").fontSize(11).fillColor(MUTED_COLOR).text(blueprint.brand.organizationName.toUpperCase(), MARGIN, y, {
    align: "center",
    width: doc.page.width - MARGIN * 2,
  });
  y = doc.y + 40;

  doc.font("Helvetica-Bold").fontSize(28).fillColor(TEXT_COLOR).text(blueprint.title, MARGIN, y, {
    align: "center",
    width: doc.page.width - MARGIN * 2,
  });
  if (blueprint.subtitle) {
    doc.moveDown(0.5);
    doc.font("Helvetica").fontSize(13).fillColor(MUTED_COLOR).text(blueprint.subtitle, { align: "center" });
  }
  if (blueprint.documentNumber) {
    doc.moveDown(0.5);
    doc.font("Helvetica").fontSize(10).fillColor(MUTED_COLOR).text(blueprint.documentNumber, { align: "center" });
  }

  if (blueprint.preparedFor) {
    doc.moveDown(3);
    const boxY = doc.y;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(MUTED_COLOR).text("PREPARED FOR", MARGIN, boxY, { align: "center", width: doc.page.width - MARGIN * 2 });
    doc.font("Helvetica-Bold").fontSize(13).fillColor(TEXT_COLOR).text(blueprint.preparedFor.name, { align: "center" });
    if (blueprint.preparedFor.company) {
      doc.font("Helvetica").fontSize(11).fillColor(MUTED_COLOR).text(blueprint.preparedFor.company, { align: "center" });
    }
  }

  if (blueprint.coverNote) {
    doc.moveDown(2);
    doc.font("Helvetica-Oblique").fontSize(10).fillColor(MUTED_COLOR).text(blueprint.coverNote, MARGIN + 40, doc.y, {
      align: "center",
      width: doc.page.width - (MARGIN + 40) * 2,
    });
  }

  const dateStr = (blueprint.generatedAt ?? new Date()).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  doc.font("Helvetica").fontSize(9).fillColor(MUTED_COLOR).text(dateStr, MARGIN, doc.page.height - MARGIN - 20, {
    align: "center",
    width: doc.page.width - MARGIN * 2,
  });
}

function renderSectionHeading(doc: PDFKit.PDFDocument, text: string) {
  doc.font("Helvetica-Bold").fontSize(18).fillColor(TEXT_COLOR).text(text);
  doc.moveTo(MARGIN, doc.y + 4).lineTo(MARGIN + 60, doc.y + 4).lineWidth(3).strokeColor(BRAND_COLOR).stroke();
  doc.moveDown(1.2);
  doc.lineWidth(1);
}

function renderSignaturePage(doc: PDFKit.PDFDocument, blueprint: DocumentBlueprint) {
  renderSectionHeading(doc, "Signatures");
  const parties = blueprint.signatureBlock?.parties ?? [];
  const boxWidth = (doc.page.width - MARGIN * 2 - 30) / 2;

  parties.forEach((party, i) => {
    const col = i % 2;
    if (col === 0 && i > 0) doc.moveDown(4);
    const x = MARGIN + col * (boxWidth + 30);
    const y = doc.y;
    doc.font("Helvetica-Bold").fontSize(10).fillColor(TEXT_COLOR).text(party.role, x, y, { width: boxWidth });
    doc.moveTo(x, y + 45).lineTo(x + boxWidth, y + 45).strokeColor("#999999").stroke();
    doc.font("Helvetica").fontSize(9).fillColor(MUTED_COLOR).text(party.name ?? "Signature", x, y + 50, { width: boxWidth });
    doc.text("Date: ______________", x, y + 66, { width: boxWidth });
    if (blueprint.docusignAnchor && i === 0) {
      // Literal anchor text DocuSign's anchorString tabs search the
      // document's text layer for — kept tiny and near-white so it doesn't
      // read as visible clutter, but it's real extractable text, not an
      // invisible/hidden layer, so it still prints if anchor matching fails.
      doc.font("Helvetica").fontSize(4).fillColor("#fefefe").text("/sig1/", x, y + 80, { width: boxWidth });
    }
    doc.fillColor(TEXT_COLOR);
    if (col === 1) doc.moveDown(4);
  });
}

/**
 * Renders a full DocumentBlueprint to a premium PDF: cover page, an
 * accurate Table of Contents (each top-level section gets its own page,
 * which makes page numbers deterministic instead of estimated), dynamic
 * tables, a vector bar chart, a pricing table, a signature page, plus a
 * running footer (org name · page X of Y) and an optional watermark on
 * every page.
 */
export async function renderDocumentToPdf(blueprint: DocumentBlueprint): Promise<Buffer> {
  const doc = new PDFDocument({ size: PAGE_SIZE, margin: MARGIN, bufferPages: true });
  const bufferPromise = collectPdfBuffer(doc);

  const logo = blueprint.brand.logoUrl ? await fetchImageBuffer(blueprint.brand.logoUrl) : null;

  renderCover(doc, blueprint, logo);

  let tocPageIndex: number | null = null;
  const tocEntries: Array<{ title: string; pageNumber: number }> = [];
  let pageCounter = 1;

  if (blueprint.tableOfContents && blueprint.sections.length > 0) {
    doc.addPage();
    pageCounter += 1;
    tocPageIndex = pageCounter - 1; // 0-indexed page position for switchToPage
  }

  for (const section of blueprint.sections) {
    doc.addPage();
    pageCounter += 1;
    tocEntries.push({ title: section.heading, pageNumber: pageCounter });

    renderSectionHeading(doc, section.heading);
    if (section.body) {
      for (const paragraph of section.body.split(/\n\n+/)) {
        doc.font("Helvetica").fontSize(10.5).fillColor("#2a2a2a").text(paragraph.trim(), { align: "left", lineGap: 3 });
        doc.moveDown(0.6);
      }
    }
    if (section.bullets?.length) {
      doc.font("Helvetica").fontSize(10.5).fillColor("#2a2a2a");
      for (const bullet of section.bullets) {
        doc.text(`•  ${bullet}`, { indent: 10, lineGap: 3 });
      }
      doc.moveDown(0.6);
    }
    if (section.table) drawTable(doc, section.table);
    if (section.chart) drawBarChart(doc, section.chart);
  }

  if (blueprint.pricingTable) {
    doc.addPage();
    pageCounter += 1;
    tocEntries.push({ title: "Pricing", pageNumber: pageCounter });
    renderSectionHeading(doc, "Pricing");
    drawTable(doc, blueprint.pricingTable);
    if (blueprint.totalsSummary?.length) {
      doc.moveDown(0.5);
      const usableWidth = doc.page.width - MARGIN * 2;
      for (const row of blueprint.totalsSummary) {
        doc.font(row.emphasis ? "Helvetica-Bold" : "Helvetica").fontSize(row.emphasis ? 12 : 10).fillColor(TEXT_COLOR);
        doc.text(row.label, MARGIN, doc.y, { continued: true, width: usableWidth - 120 });
        doc.text(row.value, { align: "right" });
      }
    }
  }

  if (blueprint.signatureBlock?.parties.length) {
    doc.addPage();
    pageCounter += 1;
    renderSignaturePage(doc, blueprint);
  }

  if (tocPageIndex != null) {
    doc.switchToPage(tocPageIndex);
    doc.x = MARGIN;
    doc.y = MARGIN;
    renderSectionHeading(doc, "Table of Contents");
    const usableWidth = doc.page.width - MARGIN * 2;
    for (const entry of tocEntries) {
      const y = doc.y;
      doc.font("Helvetica").fontSize(11).fillColor("#2a2a2a").text(entry.title, MARGIN, y, { continued: true, width: usableWidth - 40 });
      doc.text(String(entry.pageNumber), { align: "right" });
      doc.moveDown(0.4);
    }
  }

  // Revisiting already-laid-out pages to stamp a footer/watermark: pdfkit's
  // .text() auto-paginates whenever it thinks content would overflow the
  // bottom margin, which — since we're deliberately drawing inside that
  // margin, on a page whose doc.y is already near the bottom from its real
  // content — spuriously appends blank pages unless the bottom margin is
  // widened to 0 for the duration of this stamp-only pass.
  const range = doc.bufferedPageRange();
  const totalPages = range.count;
  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);
    const savedBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    if (blueprint.watermark) {
      doc.save();
      doc.rotate(-40, { origin: [doc.page.width / 2, doc.page.height / 2] });
      doc.font("Helvetica-Bold").fontSize(72).fillColor("#000000").opacity(0.06);
      doc.text(blueprint.watermark, 0, doc.page.height / 2 - 40, { align: "center", width: doc.page.width, lineBreak: false });
      doc.opacity(1);
      doc.restore();
    }

    const footerY = doc.page.height - MARGIN + 10;
    doc.font("Helvetica").fontSize(8).fillColor(MUTED_COLOR);
    doc.text(blueprint.footerText ?? blueprint.brand.organizationName, MARGIN, footerY, { width: doc.page.width - MARGIN * 2 - 80, align: "left", lineBreak: false });
    doc.text(`Page ${i + 1} of ${totalPages}`, doc.page.width - MARGIN - 80, footerY, { width: 80, align: "right", lineBreak: false });

    doc.page.margins.bottom = savedBottomMargin;
  }

  doc.end();
  return bufferPromise;
}
