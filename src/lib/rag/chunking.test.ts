import { encode } from "gpt-tokenizer";
import { describe, expect, it } from "vitest";

import { chunkText } from "./chunking";

describe("chunkText", () => {
  it("returns an empty array for empty/whitespace-only input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });

  it("returns a single chunk for text well under maxTokens", () => {
    const text = "This is a short paragraph about GrowthOS.";
    const chunks = chunkText(text, { maxTokens: 512, overlapTokens: 64 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe(text);
    expect(chunks[0].tokenCount).toBe(encode(text).length);
  });

  it("never produces a chunk whose real token count exceeds maxTokens (except a single oversized paragraph's hard-split pieces)", () => {
    const paragraphs = Array.from({ length: 30 }, (_, i) => `Paragraph number ${i} discusses a real, distinct topic about the platform's feature set in some detail.`);
    const text = paragraphs.join("\n\n");
    const chunks = chunkText(text, { maxTokens: 50, overlapTokens: 10 });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(50);
      // tokenCount must be the REAL encoded length of the content, not a guess
      expect(chunk.tokenCount).toBe(encode(chunk.content).length);
    }
  });

  it("keeps paragraphs on \\n\\n boundaries within a chunk (never merges them into one run-on line)", () => {
    const text = "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.";
    const chunks = chunkText(text, { maxTokens: 512, overlapTokens: 64 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe(text);
  });

  it("produces real token-based overlap between adjacent chunks when a paragraph boundary forces a split", () => {
    const paragraphs = Array.from({ length: 10 }, (_, i) => `Topic ${i} short line.`);
    const text = paragraphs.join("\n\n");
    // Each paragraph is only a handful of tokens, so overlapTokens (15)
    // comfortably covers at least the single most recent paragraph.
    const chunks = chunkText(text, { maxTokens: 20, overlapTokens: 15 });

    expect(chunks.length).toBeGreaterThan(1);
    // Chunk 0's very last paragraph must reappear inside chunk 1 (real
    // overlap, not just adjacency), and chunk 1's own first paragraph must
    // itself be one carried over from chunk 0's tail rather than brand new.
    const firstChunkParagraphs = chunks[0].content.split("\n\n");
    const secondChunkParagraphs = chunks[1].content.split("\n\n");
    const overlapParagraph = firstChunkParagraphs[firstChunkParagraphs.length - 1];
    expect(secondChunkParagraphs).toContain(overlapParagraph);
    expect(firstChunkParagraphs).toContain(secondChunkParagraphs[0]);
  });

  it("hard-splits a single paragraph that alone exceeds maxTokens, never leaving it whole", () => {
    const hugeParagraph = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
    const chunks = chunkText(hugeParagraph, { maxTokens: 20, overlapTokens: 5 });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(20);
    }
    // Reassembling every chunk's words should reproduce every original word without loss.
    const allWords = chunks.flatMap((c) => c.content.split(/\s+/));
    expect(allWords).toEqual(hugeParagraph.split(" "));
  });

  it("uses the real default maxTokens/overlapTokens (512/64) when options are omitted", () => {
    const text = "A single reasonably short paragraph.";
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].tokenCount).toBeLessThan(512);
  });
});
