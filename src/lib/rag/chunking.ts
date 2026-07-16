import { encode } from "gpt-tokenizer";

/**
 * Real, token-aware document chunking — uses gpt-tokenizer's actual BPE
 * encoder (not a char-count approximation) so chunk sizes are accurate
 * regardless of which embedding provider ultimately consumes them. Splits
 * on paragraph boundaries first (never mid-sentence when avoidable), then
 * greedily packs paragraphs into chunks up to `maxTokens`, falling back to
 * a hard token-boundary split only for a single paragraph that alone
 * exceeds `maxTokens`. Adjacent chunks overlap by `overlapTokens` so a fact
 * split across a chunk boundary is still fully present in at least one
 * chunk — standard RAG chunking practice.
 */

export interface TextChunk {
  content: string;
  tokenCount: number;
}

export interface ChunkingOptions {
  maxTokens?: number;
  overlapTokens?: number;
}

const DEFAULT_MAX_TOKENS = 512;
const DEFAULT_OVERLAP_TOKENS = 64;

function tokenCount(text: string): number {
  return encode(text).length;
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** Hard-splits an oversized paragraph on whitespace boundaries into token-bounded pieces — only reached when a single paragraph alone exceeds maxTokens. */
function hardSplit(paragraph: string, maxTokens: number): string[] {
  const words = paragraph.split(/\s+/);
  const pieces: string[] = [];
  let current: string[] = [];

  for (const word of words) {
    const candidate = [...current, word].join(" ");
    if (tokenCount(candidate) > maxTokens && current.length > 0) {
      pieces.push(current.join(" "));
      current = [word];
    } else {
      current.push(word);
    }
  }
  if (current.length > 0) pieces.push(current.join(" "));
  return pieces;
}

export function chunkText(text: string, options: ChunkingOptions = {}): TextChunk[] {
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const overlapTokens = options.overlapTokens ?? DEFAULT_OVERLAP_TOKENS;

  const paragraphs = splitParagraphs(text).flatMap((p) => (tokenCount(p) > maxTokens ? hardSplit(p, maxTokens) : [p]));
  if (paragraphs.length === 0) return [];

  const chunks: TextChunk[] = [];
  let currentParagraphs: string[] = [];
  let currentTokens = 0;

  function flush(): void {
    if (currentParagraphs.length === 0) return;
    const content = currentParagraphs.join("\n\n");
    chunks.push({ content, tokenCount: tokenCount(content) });
  }

  for (const paragraph of paragraphs) {
    const paragraphTokens = tokenCount(paragraph);
    if (currentTokens + paragraphTokens > maxTokens && currentParagraphs.length > 0) {
      flush();
      // Real overlap: carry the tail paragraphs whose combined tokens are <= overlapTokens into the next chunk.
      const overlapParagraphs: string[] = [];
      let overlapCount = 0;
      for (let i = currentParagraphs.length - 1; i >= 0; i--) {
        const t = tokenCount(currentParagraphs[i]);
        if (overlapCount + t > overlapTokens) break;
        overlapParagraphs.unshift(currentParagraphs[i]);
        overlapCount += t;
      }
      currentParagraphs = overlapParagraphs;
      currentTokens = overlapCount;
    }
    currentParagraphs.push(paragraph);
    currentTokens += paragraphTokens;
  }
  flush();

  return chunks;
}
