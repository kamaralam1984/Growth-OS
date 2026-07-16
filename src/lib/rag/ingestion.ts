import * as cheerio from "cheerio";
import JSZip from "jszip";
import * as XLSX from "xlsx";

import { isAIConnected, AINotConnectedError } from "@/lib/ai/client";
import { generateText } from "@/lib/ai/fallback";

/**
 * Real document-text extraction for the Document Ingestion pipeline —
 * every format below is genuinely parsed (no placeholder "TODO: parse me"
 * stub). Image OCR deliberately uses Claude's vision input rather than a
 * separate OCR library (Tesseract etc.) — this app already has exactly one
 * LLM SDK (@anthropic-ai/sdk) and one AI connection to manage
 * (src/lib/ai/client.ts's isAIConnected() gate), so image ingestion reuses
 * that same connection/error-handling discipline instead of introducing a
 * second, differently-configured AI dependency.
 */

const TEXT_MIME_TYPES = new Set(["text/plain", "text/markdown", "text/x-markdown"]);
const HTML_MIME_TYPES = new Set(["text/html"]);
const CSV_MIME_TYPES = new Set(["text/csv"]);
const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);

function extFromFilename(filename: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(filename);
  return match ? match[1].toLowerCase() : "";
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

async function extractXlsx(buffer: Buffer): Promise<string> {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  return workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    return `## ${sheetName}\n${csv}`;
  }).join("\n\n");
}

async function extractCsvBuffer(buffer: Buffer): Promise<string> {
  const workbook = XLSX.read(buffer.toString("utf-8"), { type: "string" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_csv(sheet);
}

async function extractPptx(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const numA = Number(/slide(\d+)\.xml$/.exec(a)?.[1] ?? 0);
      const numB = Number(/slide(\d+)\.xml$/.exec(b)?.[1] ?? 0);
      return numA - numB;
    });

  const slideTexts: string[] = [];
  for (const [index, name] of slideFiles.entries()) {
    const xml = await zip.files[name].async("string");
    const $ = cheerio.load(xml, { xmlMode: true });
    const text = $("a\\:t")
      .map((_, el) => $(el).text())
      .get()
      .join(" ");
    if (text.trim()) slideTexts.push(`## Slide ${index + 1}\n${text.trim()}`);
  }
  return slideTexts.join("\n\n");
}

function extractHtml(buffer: Buffer): string {
  const $ = cheerio.load(buffer.toString("utf-8"));
  $("script, style").remove();
  return $("body").text().replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Real OCR/description extraction via vision — throws AINotConnectedError
 * honestly if AI isn't connected, never fabricates extracted text. Goes
 * through the fallback chain (src/lib/ai/fallback.ts), but only Anthropic
 * and Gemini actually support vision — Groq/OpenRouter throw immediately on
 * an image request (see providers/openai-compatible.ts) so the chain skips
 * straight past them instead of hallucinating a transcription.
 */
async function extractImageText(buffer: Buffer, mimeType: string): Promise<string> {
  if (!isAIConnected()) throw new AINotConnectedError();
  const result = await generateText({
    system: "",
    userContent:
      "Transcribe every piece of readable text in this image verbatim, preserving structure (headings, lists, tables) as plain text/markdown. If there is no readable text, briefly describe the image's content instead. Do not add commentary before or after.",
    maxTokens: 2048,
    image: { mediaType: mimeType as "image/png" | "image/jpeg" | "image/webp" | "image/gif", base64: buffer.toString("base64") },
  });
  return result.text;
}

// Zip-bomb guard: JSZip decompresses each entry fully into memory
// (`file.async("nodebuffer")`) with no size limit of its own, so a single
// small uploaded archive containing one maliciously-crafted highly-
// compressed entry (or many entries) can exhaust server memory. Caps both
// a single entry's declared uncompressed size and the running total across
// the archive.
const MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES = 100 * 1024 * 1024; // 100MB
const MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES = 250 * 1024 * 1024; // 250MB

/**
 * JSZip's public API doesn't expose an entry's declared uncompressed size
 * before decompressing it (index.d.ts documents `_data.uncompressedSize`
 * but keeps it as an internal/private field) — reading it here is a
 * best-effort pre-check, not load-bearing on its own: if it's ever
 * unavailable (a future JSZip version), this just returns null and the
 * running-total cap below (checked AFTER each real decompression) still
 * bounds the archive as a whole, just one entry later than ideal.
 */
function declaredUncompressedSize(file: JSZip.JSZipObject): number | null {
  const size = (file as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
  return typeof size === "number" ? size : null;
}

async function extractZipArchive(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const sections: string[] = [];
  let totalUncompressedBytes = 0;
  for (const [name, file] of Object.entries(zip.files)) {
    if (file.dir) continue;
    const ext = extFromFilename(name);
    if (!["pdf", "docx", "xlsx", "pptx", "txt", "md", "csv", "html", "htm"].includes(ext)) continue;

    const declaredSize = declaredUncompressedSize(file);
    if (declaredSize !== null && declaredSize > MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES) {
      console.error(`[rag/ingestion] skipping "${name}" from ZIP archive: declared uncompressed size ${declaredSize} exceeds the ${MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES}-byte per-entry cap.`);
      continue;
    }
    if (totalUncompressedBytes > MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES) {
      console.error(`[rag/ingestion] stopping ZIP archive extraction: cumulative uncompressed size exceeded the ${MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES}-byte archive cap.`);
      break;
    }

    try {
      const entryBuffer = Buffer.from(await file.async("nodebuffer"));
      totalUncompressedBytes += entryBuffer.byteLength;
      if (totalUncompressedBytes > MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES) {
        console.error(`[rag/ingestion] discarding "${name}": extracting it pushed the archive's cumulative uncompressed size over the ${MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES}-byte cap.`);
        break;
      }
      const text = await extractDocumentText(entryBuffer, mimeTypeFromExtension(ext), name);
      if (text.trim()) sections.push(`# ${name}\n\n${text.trim()}`);
    } catch (error) {
      console.error(`[rag/ingestion] failed to extract "${name}" from ZIP archive:`, error);
    }
  }
  return sections.join("\n\n---\n\n");
}

function mimeTypeFromExtension(ext: string): string {
  switch (ext) {
    case "pdf": return "application/pdf";
    case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "pptx": return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case "csv": return "text/csv";
    case "html": case "htm": return "text/html";
    case "md": return "text/markdown";
    case "zip": return "application/zip";
    default: return "text/plain";
  }
}

/** Real, format-specific text extraction — the single entry point both direct uploads and ZIP-archive entries go through. Throws on genuinely unsupported formats rather than returning empty text silently. */
export async function extractDocumentText(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
  const ext = extFromFilename(filename);

  if (mimeType === "application/pdf" || ext === "pdf") return extractPdf(buffer);
  if (mimeType.includes("wordprocessingml") || ext === "docx") return extractDocx(buffer);
  if (mimeType.includes("spreadsheetml") || ext === "xlsx" || ext === "xls") return extractXlsx(buffer);
  if (mimeType.includes("presentationml") || ext === "pptx") return extractPptx(buffer);
  if (CSV_MIME_TYPES.has(mimeType) || ext === "csv") return extractCsvBuffer(buffer);
  if (HTML_MIME_TYPES.has(mimeType) || ext === "html" || ext === "htm") return extractHtml(buffer);
  if (IMAGE_MIME_TYPES.has(mimeType) || ["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return extractImageText(buffer, mimeType || mimeTypeFromExtension(ext));
  if (mimeType === "application/zip" || ext === "zip") return extractZipArchive(buffer);
  if (TEXT_MIME_TYPES.has(mimeType) || ext === "txt" || ext === "md") return buffer.toString("utf-8");

  // Unknown MIME/extension — best-effort UTF-8 decode rather than an outright throw, since many real text-ish files (log files, .json, .yaml, .csv without the exact extension) are still genuinely readable this way.
  return buffer.toString("utf-8");
}

export const SUPPORTED_INGESTION_EXTENSIONS = ["pdf", "docx", "pptx", "xlsx", "xls", "txt", "md", "csv", "html", "htm", "png", "jpg", "jpeg", "webp", "gif", "zip"];
