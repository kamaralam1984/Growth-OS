import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Header,
  Footer,
  PageNumber,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ImageRun,
  TableOfContents,
  ShadingType,
  VerticalAlign,
} from "docx";

import type { DocumentBlueprint, DocumentTableData } from "./blueprint";

const BRAND_HEX = "E11D48";
const MUTED_HEX = "666666";

type SupportedImageType = "jpg" | "png" | "gif" | "bmp";

function imageTypeFromContentType(contentType: string): SupportedImageType | null {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("gif")) return "gif";
  if (contentType.includes("bmp")) return "bmp";
  return null;
}

/** Best-effort logo fetch — mirrors pdf-renderer.ts's fetchImageBuffer; unsupported/broken logos are skipped, never fatal. */
async function fetchLogo(url: string): Promise<{ data: Buffer; type: SupportedImageType } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    const type = imageTypeFromContentType(contentType);
    if (!type) return null;
    return { data: Buffer.from(await res.arrayBuffer()), type };
  } catch {
    return null;
  }
}

function buildTable(table: DocumentTableData): Table {
  const headerRow = new TableRow({
    tableHeader: true,
    children: table.headers.map(
      (h, i) =>
        new TableCell({
          shading: { type: ShadingType.SOLID, color: "F3F4F6", fill: "F3F4F6" },
          verticalAlign: VerticalAlign.CENTER,
          children: [
            new Paragraph({
              alignment: table.alignRightColumns?.includes(i) ? AlignmentType.RIGHT : AlignmentType.LEFT,
              children: [new TextRun({ text: h, bold: true, size: 18 })],
            }),
          ],
        }),
    ),
  });

  const bodyRows = table.rows.map(
    (row) =>
      new TableRow({
        children: row.map(
          (cell, i) =>
            new TableCell({
              verticalAlign: VerticalAlign.CENTER,
              children: [
                new Paragraph({
                  alignment: table.alignRightColumns?.includes(i) ? AlignmentType.RIGHT : AlignmentType.LEFT,
                  children: [new TextRun({ text: String(cell), size: 18 })],
                }),
              ],
            }),
        ),
      }),
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...bodyRows],
  });
}

function paragraphsFromBody(body: string): Paragraph[] {
  return body
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => new Paragraph({ children: [new TextRun({ text: p, size: 21 })], spacing: { after: 160 } }));
}

/**
 * Renders a DocumentBlueprint to a .docx buffer — the DOCX counterpart of
 * pdf-renderer.ts, consuming the exact same blueprint so both formats stay
 * in sync by construction. Chart data renders as a formatted table here
 * (the docx package's high-level API has no native chart-object support,
 * unlike pdfkit where a real vector bar chart is drawn — documented
 * limitation, not a silent gap). Watermarking similarly has no first-class
 * API in this package; a "watermark" here is a subtitled header line
 * rather than PDF's true diagonal overlay.
 */
export async function renderDocumentToDocx(blueprint: DocumentBlueprint): Promise<Buffer> {
  const logo = blueprint.brand.logoUrl ? await fetchLogo(blueprint.brand.logoUrl) : null;

  const header = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({ text: blueprint.brand.organizationName, size: 16, color: MUTED_HEX }),
          ...(blueprint.watermark ? [new TextRun({ text: `   •   ${blueprint.watermark}`, size: 16, color: MUTED_HEX, italics: true })] : []),
        ],
      }),
    ],
  });

  const footer = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: (blueprint.footerText ?? blueprint.brand.organizationName) + "  ·  Page ", size: 16, color: MUTED_HEX }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16, color: MUTED_HEX }),
          new TextRun({ text: " of ", size: 16, color: MUTED_HEX }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: MUTED_HEX }),
        ],
      }),
    ],
  });

  const coverChildren: Paragraph[] = [];
  if (logo) {
    coverChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new ImageRun({ type: logo.type, data: logo.data, transformation: { width: 80, height: 80 } })],
      }),
    );
  }
  coverChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [new TextRun({ text: blueprint.brand.organizationName.toUpperCase(), size: 20, color: MUTED_HEX, bold: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: blueprint.title, bold: true, size: 56 })],
    }),
  );
  if (blueprint.subtitle) {
    coverChildren.push(
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120 }, children: [new TextRun({ text: blueprint.subtitle, size: 26, color: MUTED_HEX })] }),
    );
  }
  if (blueprint.documentNumber) {
    coverChildren.push(
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80 }, children: [new TextRun({ text: blueprint.documentNumber, size: 20, color: MUTED_HEX })] }),
    );
  }
  if (blueprint.preparedFor) {
    coverChildren.push(
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 500 }, children: [new TextRun({ text: "PREPARED FOR", bold: true, size: 18, color: MUTED_HEX })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: blueprint.preparedFor.name, bold: true, size: 26 })] }),
    );
    if (blueprint.preparedFor.company) {
      coverChildren.push(
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: blueprint.preparedFor.company, size: 22, color: MUTED_HEX })] }),
      );
    }
  }
  const dateStr = (blueprint.generatedAt ?? new Date()).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  coverChildren.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 600 }, children: [new TextRun({ text: dateStr, size: 18, color: MUTED_HEX })] }));
  coverChildren.push(new Paragraph({ children: [], pageBreakBefore: true }));

  const bodyChildren: Array<Paragraph | Table> = [];

  if (blueprint.tableOfContents && blueprint.sections.length > 0) {
    bodyChildren.push(
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Table of Contents")] }),
      // A native Word TOC field — populated by Word itself on open (or via
      // right-click → "Update Field"), the standard mechanism for a
      // programmatically-generated .docx; it cannot be pre-rendered by the
      // generating library the way pdf-renderer.ts computes page numbers
      // directly, since actual pagination only exists once Word lays the
      // document out with its own fonts/rendering engine.
      new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-1" }),
      new Paragraph({
        children: [new TextRun({ text: "(Right-click above and choose “Update Field” to populate this Table of Contents.)", italics: true, size: 16, color: MUTED_HEX })],
      }),
      new Paragraph({ children: [], pageBreakBefore: true }),
    );
  }

  for (const section of blueprint.sections) {
    bodyChildren.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BRAND_HEX, space: 4 } },
        children: [new TextRun(section.heading)],
      }),
    );
    if (section.body) bodyChildren.push(...paragraphsFromBody(section.body));
    if (section.bullets?.length) {
      for (const bullet of section.bullets) {
        bodyChildren.push(new Paragraph({ text: bullet, bullet: { level: 0 } }));
      }
    }
    if (section.table) bodyChildren.push(buildTable(section.table));
    if (section.chart) {
      bodyChildren.push(new Paragraph({ spacing: { before: 160 }, children: [new TextRun({ text: "(Chart data — rendered as a table in this format)", italics: true, size: 18, color: MUTED_HEX })] }));
      bodyChildren.push(
        buildTable({
          headers: section.chart.labels,
          rows: [section.chart.values.map((v) => `${v}${section.chart!.valueSuffix ?? ""}`)],
        }),
      );
    }
    bodyChildren.push(new Paragraph({ children: [], pageBreakBefore: true }));
  }

  if (blueprint.pricingTable) {
    bodyChildren.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Pricing")] }), buildTable(blueprint.pricingTable));
    if (blueprint.totalsSummary?.length) {
      for (const row of blueprint.totalsSummary) {
        bodyChildren.push(
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { before: 80 },
            children: [
              new TextRun({ text: `${row.label}:  `, bold: row.emphasis, size: row.emphasis ? 24 : 20 }),
              new TextRun({ text: row.value, bold: row.emphasis, size: row.emphasis ? 24 : 20 }),
            ],
          }),
        );
      }
    }
    bodyChildren.push(new Paragraph({ children: [], pageBreakBefore: true }));
  }

  if (blueprint.signatureBlock?.parties.length) {
    bodyChildren.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Signatures")] }));
    bodyChildren.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: blueprint.signatureBlock.parties.map(
              (party) =>
                new TableCell({
                  margins: { top: 200, bottom: 200, left: 200, right: 200 },
                  children: [
                    new Paragraph({ children: [new TextRun({ text: party.role, bold: true })] }),
                    new Paragraph({ spacing: { before: 400 }, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "999999" } }, children: [new TextRun(" ")] }),
                    new Paragraph({ children: [new TextRun({ text: party.name ?? "Signature", size: 18, color: MUTED_HEX })] }),
                    new Paragraph({ children: [new TextRun({ text: "Date: ______________", size: 18, color: MUTED_HEX })] }),
                  ],
                }),
            ),
          }),
        ],
      }),
    );
  }

  const doc = new Document({
    features: { updateFields: true },
    sections: [
      { properties: {}, headers: { default: header }, footers: { default: footer }, children: coverChildren },
      { properties: {}, headers: { default: header }, footers: { default: footer }, children: bodyChildren },
    ],
  });

  return Packer.toBuffer(doc);
}
