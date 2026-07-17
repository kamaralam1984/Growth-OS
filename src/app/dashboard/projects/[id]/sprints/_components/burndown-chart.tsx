import type { BurndownPoint } from "@/lib/projects/burndown";

const WIDTH = 640;
const HEIGHT = 220;
const PADDING = 28;

function buildPath(values: Array<number | null>, maxY: number): string {
  const usableWidth = WIDTH - PADDING * 2;
  const usableHeight = HEIGHT - PADDING * 2;
  const points = values
    .map((v, i) => {
      if (v == null) return null;
      const x = PADDING + (values.length <= 1 ? 0 : (i / (values.length - 1)) * usableWidth);
      const y = PADDING + usableHeight - (maxY === 0 ? 0 : (v / maxY) * usableHeight);
      return `${x},${y}`;
    })
    .filter(Boolean);
  return points.length > 0 ? `M ${points.join(" L ")}` : "";
}

/** Real ideal-vs-actual burndown, pure SVG (no chart library in this repo). Actual line stops at "today" — future days are genuinely unknown, never projected as fake data. */
export function BurndownChart({ points, totalTasks }: { points: BurndownPoint[]; totalTasks: number }) {
  if (points.length === 0) {
    return <p className="text-sm text-muted-foreground">No burndown data yet.</p>;
  }

  const maxY = Math.max(totalTasks, 1);
  const idealPath = buildPath(points.map((p) => p.idealRemaining), maxY);
  const actualPath = buildPath(points.map((p) => p.actualRemaining), maxY);
  const actualValues = points.map((p) => p.actualRemaining).filter((v): v is number => v != null);
  const currentRemaining = actualValues.length > 0 ? actualValues[actualValues.length - 1] : totalTasks;
  const ariaLabel = `Sprint burndown chart: ${totalTasks} total task${totalTasks === 1 ? "" : "s"} over ${points.length} day${points.length === 1 ? "" : "s"}, ${currentRemaining} remaining as of today`;

  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label={ariaLabel}>
        <line x1={PADDING} y1={HEIGHT - PADDING} x2={WIDTH - PADDING} y2={HEIGHT - PADDING} stroke="currentColor" className="text-border" strokeWidth={1} />
        <line x1={PADDING} y1={PADDING} x2={PADDING} y2={HEIGHT - PADDING} stroke="currentColor" className="text-border" strokeWidth={1} />
        {idealPath && <path d={idealPath} fill="none" stroke="currentColor" className="text-muted-foreground" strokeWidth={2} strokeDasharray="4 4" />}
        {actualPath && <path d={actualPath} fill="none" stroke="currentColor" className="text-primary" strokeWidth={2.5} />}
      </svg>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-muted-foreground" /> Ideal
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-primary" /> Actual
        </span>
      </div>
    </div>
  );
}
