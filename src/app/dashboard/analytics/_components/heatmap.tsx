const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** CSS-grid heatmap — no charting library. Cells shade by intensity relative to the max cell in the grid. */
export function Heatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());
  const allZero = grid.every((row) => row.every((v) => v === 0));

  if (allZero) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No completed tasks yet.</p>;
  }

  const weeks = grid[0]?.length ?? 0;
  const total = grid.flat().reduce((sum, v) => sum + v, 0);
  const ariaLabel = `Heatmap of completed tasks across ${weeks} week${weeks === 1 ? "" : "s"}: ${total} task${total === 1 ? "" : "s"} completed in total, peak of ${max} in a single day`;

  return (
    <div className="flex flex-col gap-1.5" role="img" aria-label={ariaLabel}>
      <div className="grid gap-1" style={{ gridTemplateColumns: `28px repeat(${weeks}, 1fr)` }}>
        <span />
        {Array.from({ length: weeks }).map((_, w) => (
          <span key={w} className="text-center text-[10px] text-muted-foreground">
            W{w + 1}
          </span>
        ))}
        {grid.map((row, dayIndex) => (
          <div key={DAY_LABELS[dayIndex]} className="contents">
            <span className="flex items-center text-[10px] text-muted-foreground">{DAY_LABELS[dayIndex]}</span>
            {row.map((value, weekIndex) => {
              const intensity = value / max;
              return (
                <div
                  key={weekIndex}
                  className="aspect-square w-full rounded-sm bg-primary"
                  style={{ opacity: value === 0 ? 0.08 : Math.max(0.15, intensity) }}
                  title={`${DAY_LABELS[dayIndex]}, week ${weekIndex + 1}: ${value} completed`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
