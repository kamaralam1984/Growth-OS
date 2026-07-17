/** Same visual language as the dashboard home's "Weekly Performance" bars — bg-muted track, bg-primary fill. */
export function BarTrend({ bars }: { bars: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  const values = bars.map((b) => b.value);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const ariaLabel =
    bars.length > 0
      ? `Bar chart from ${bars[0].label} to ${bars[bars.length - 1].label}, values ranging from ${dataMin} to ${dataMax}`
      : "Bar chart";

  return (
    <div className="flex items-end gap-1.5" role="img" aria-label={ariaLabel}>
      {bars.map((bar) => {
        const pct = Math.round((bar.value / max) * 100);
        return (
          <div key={bar.label} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex h-20 w-full items-end overflow-hidden rounded-md bg-muted" title={`${bar.label}: ${bar.value}`}>
              <div
                className="w-full rounded-md bg-primary transition-[height]"
                style={{ height: `${Math.max(pct, bar.value > 0 ? 6 : 0)}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground">{bar.label}</span>
          </div>
        );
      })}
    </div>
  );
}
