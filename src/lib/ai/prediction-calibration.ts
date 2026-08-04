import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Real, closed self-improvement loop — see PredictionCalibration's schema
 * doc comment for the full picture. This file: computes the comparison
 * between BoardReview.winProbability estimates and real terminal Proposal
 * outcomes, persists it, and formats the latest result as real grounding
 * text for the next review round (review-orchestrator.ts).
 */

// Below this many real terminal (ACCEPTED/REJECTED) proposals with a known
// winProbability estimate, refuse to persist or return a calibration at
// all — a 5-outcome sample can trivially show 0/20/40/60/80/100% band rates
// that look meaningful but are pure noise; 10 is the smallest sample where
// a computed win-rate stat is honestly worth showing an owner or feeding
// back into an agent's prompt.
const MIN_SAMPLE_SIZE = 10;

const BANDS = [
  { label: "0-20%", min: 0, max: 20 },
  { label: "20-40%", min: 20, max: 40 },
  { label: "40-60%", min: 40, max: 60 },
  { label: "60-80%", min: 60, max: 80 },
  { label: "80-100%", min: 80, max: 100 },
] as const;

export interface CalibrationBand {
  label: string;
  min: number;
  max: number;
  sampleSize: number;
  wonCount: number;
  /** null only when sampleSize === 0 for this band — never a fabricated 0%. */
  actualWinRate: number | null;
  avgPredictedWinProbability: number | null;
}

export interface CalibrationResult {
  sampleSize: number;
  bands: CalibrationBand[];
  summary: string;
}

/** Deterministic — no AI call, so this costs nothing to run nightly for every org. */
function buildCalibrationSummary(sampleSize: number, bands: CalibrationBand[]): string {
  const withData = bands.filter((b) => b.sampleSize > 0);
  if (withData.length === 0) {
    return `${sampleSize} terminal proposal(s) reviewed, but no band has enough data yet.`;
  }
  const gaps = withData
    .filter((b) => b.actualWinRate != null && b.avgPredictedWinProbability != null)
    .map((b) => b.avgPredictedWinProbability! - b.actualWinRate!);
  const avgGap = gaps.length > 0 ? gaps.reduce((a, c) => a + c, 0) / gaps.length : 0;
  const tendency = Math.abs(avgGap) < 5 ? "reasonably well-calibrated" : avgGap > 0 ? "somewhat overconfident" : "somewhat underconfident";
  return `Based on ${sampleSize} real terminal proposal(s), the board's win-probability estimates have been ${tendency} (avg gap: ${avgGap >= 0 ? "+" : ""}${Math.round(avgGap)} points vs actual outcomes).`;
}

/**
 * Pure computation — no persistence. Returns null if there isn't yet a
 * real, honest basis to compute a calibration from (see MIN_SAMPLE_SIZE) —
 * same "honest or nothing" convention as everywhere else in this codebase.
 */
export async function computePredictionCalibration(organizationId: string): Promise<CalibrationResult | null> {
  const reviews = await prisma.boardReview.findMany({
    where: { organizationId, docKind: "PROPOSAL", winProbability: { not: null } },
    select: { docId: true, winProbability: true },
  });
  if (reviews.length === 0) return null;

  const proposals = await prisma.proposal.findMany({
    where: { id: { in: reviews.map((r) => r.docId) }, status: { in: ["ACCEPTED", "REJECTED"] } },
    select: { id: true, status: true },
  });
  const statusByProposalId = new Map(proposals.map((p) => [p.id, p.status]));

  const terminal = reviews
    .filter((r) => statusByProposalId.has(r.docId))
    .map((r) => ({ winProbability: r.winProbability!, won: statusByProposalId.get(r.docId) === "ACCEPTED" }));

  if (terminal.length < MIN_SAMPLE_SIZE) return null;

  const bands: CalibrationBand[] = BANDS.map((b) => {
    const inBand = terminal.filter((t) => t.winProbability >= b.min && (b.max === 100 ? t.winProbability <= b.max : t.winProbability < b.max));
    const wonCount = inBand.filter((t) => t.won).length;
    return {
      label: b.label,
      min: b.min,
      max: b.max,
      sampleSize: inBand.length,
      wonCount,
      actualWinRate: inBand.length > 0 ? (wonCount / inBand.length) * 100 : null,
      avgPredictedWinProbability: inBand.length > 0 ? inBand.reduce((s, t) => s + t.winProbability, 0) / inBand.length : null,
    };
  });

  return { sampleSize: terminal.length, bands, summary: buildCalibrationSummary(terminal.length, bands) };
}

/**
 * Nightly per-org entry point (src/lib/scheduler/registry.ts). Appends a
 * new row (never upserts — real history, one row per computation run).
 * No-ops honestly (no row written) when there isn't enough real data yet.
 */
export async function runPredictionCalibrationForOrg(organizationId: string): Promise<{ persisted: boolean; sampleSize?: number }> {
  const result = await computePredictionCalibration(organizationId);
  if (!result) return { persisted: false };

  await prisma.predictionCalibration.create({
    data: {
      organizationId,
      sampleSize: result.sampleSize,
      bandsJson: result.bands as unknown as Prisma.InputJsonValue,
      summary: result.summary,
    },
  });
  return { persisted: true, sampleSize: result.sampleSize };
}

/** Reads the org's most recent calibration row — used by both the review-orchestrator feedback injection and the Reviews page UI. */
export function getLatestCalibration(organizationId: string) {
  return prisma.predictionCalibration.findFirst({ where: { organizationId }, orderBy: { computedAt: "desc" } });
}

/**
 * Formats a calibration row into the real text spliced into
 * runReviewAgentTurn's calibrationContext param. Returns undefined (not a
 * padded string) when there's no real calibration yet or every band is
 * empty — an agent should never be told a fabricated calibration.
 */
export function formatCalibrationContext(calibration: { sampleSize: number; bandsJson: unknown } | null): string | undefined {
  if (!calibration) return undefined;
  const bands = calibration.bandsJson as CalibrationBand[];
  const withData = bands.filter((b) => b.sampleSize > 0 && b.actualWinRate != null);
  if (withData.length === 0) return undefined;
  const lines = withData.map(
    (b) => `- Estimated ${b.label}: those proposals actually won ${Math.round(b.actualWinRate!)}% of the time (n=${b.sampleSize}).`,
  );
  return [
    `Historical calibration data (${calibration.sampleSize} past proposals with a known outcome — use this to calibrate, don't just go with gut feel):`,
    ...lines,
  ].join("\n");
}
