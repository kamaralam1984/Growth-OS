/** Same visual language as the dashboard home's "Weekly Performance" bars — bg-muted track, bg-primary fill. */
export function BarTrend({ bars }: { bars: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...bars.map((b) => b.value));

  return (
    <div className="flex items-end gap-1.5">
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
