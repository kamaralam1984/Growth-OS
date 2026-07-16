/**
 * Minimal, dependency-free SVG line chart — same single-hue (primary),
 * <title>-tooltip approach as src/app/dashboard/analytics/_components/line-trend.tsx
 * (colocated here rather than cross-imported across route-private _components
 * folders) rather than pulling in a charting library.
 */
export function CallsOverTimeChart({
  points,
  formatValue,
  height = 120,
}: {
  points: Array<{ label: string; value: number }>;
  formatValue: (value: number) => string;
  height?: number;
}) {
  if (points.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Not enough history yet — check back tomorrow.</p>;
  }

  const width = 600;
  const padding = 8;
  const values = points.map((p) => p.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const coords = points.map((p, i) => {
    const x = points.length === 1 ? width / 2 : padding + (i / (points.length - 1)) * (width - padding * 2);
    const y = height - padding - ((p.value - min) / range) * (height - padding * 2);
    return { x, y, ...p };
  });

  const path = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");
  const areaPath = `${path} L ${coords[coords.length - 1].x.toFixed(1)} ${height - padding} L ${coords[0].x.toFixed(1)} ${height - padding} Z`;

  return (
    <div className="flex flex-col gap-1">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" preserveAspectRatio="none" role="img">
        <path d={areaPath} fill="var(--color-primary)" opacity={0.08} />
        <path d={path} fill="none" stroke="var(--color-primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {coords.map((c, i) => (
          <circle key={`${c.label}-${i}`} cx={c.x} cy={c.y} r={3} fill="var(--color-primary)">
            <title>
              {c.label}: {formatValue(c.value)}
            </title>
          </circle>
        ))}
      </svg>
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>{points[0].label}</span>
        <span>{points[points.length - 1].label}</span>
      </div>
    </div>
  );
}
