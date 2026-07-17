/**
 * Dependency-free SVG radar/spider chart — same single-hue (primary) visual
 * language as LineTrend/BarTrend rather than pulling in a charting library.
 * Fixed 0-100 scale since every axis here is a CompanyHealthScores sub-score.
 */
export function RadarChart({
  axes,
  size = 260,
}: {
  axes: Array<{ label: string; value: number }>;
  size?: number;
}) {
  if (axes.length < 3) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Not enough dimensions to plot yet.</p>;
  }

  const center = size / 2;
  const radius = size / 2 - 36;
  const angleStep = (Math.PI * 2) / axes.length;
  const angleFor = (i: number) => i * angleStep - Math.PI / 2;

  const pointAt = (i: number, value: number) => {
    const r = (Math.max(0, Math.min(100, value)) / 100) * radius;
    const angle = angleFor(i);
    return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) };
  };

  const polygon = axes.map((a, i) => pointAt(i, a.value)).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const rings = [25, 50, 75, 100];
  const ariaLabel = `Radar chart with ${axes.length} dimensions: ${axes.map((a) => `${a.label} ${Math.round(a.value)}/100`).join(", ")}`;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-auto w-full max-w-xs" role="img" aria-label={ariaLabel}>
        {rings.map((ring) => (
          <polygon
            key={ring}
            points={axes.map((_, i) => pointAt(i, ring)).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth={1}
          />
        ))}
        {axes.map((a, i) => {
          const edge = pointAt(i, 100);
          return (
            <line
              key={a.label}
              x1={center}
              y1={center}
              x2={edge.x}
              y2={edge.y}
              stroke="var(--color-border)"
              strokeWidth={1}
            />
          );
        })}
        <polygon points={polygon} fill="var(--color-primary)" fillOpacity={0.15} stroke="var(--color-primary)" strokeWidth={2} />
        {axes.map((a, i) => {
          const p = pointAt(i, a.value);
          return (
            <circle key={a.label} cx={p.x} cy={p.y} r={3} fill="var(--color-primary)">
              <title>
                {a.label}: {Math.round(a.value)}/100
              </title>
            </circle>
          );
        })}
        {axes.map((a, i) => {
          const labelPoint = pointAt(i, 118);
          return (
            <text
              key={a.label}
              x={labelPoint.x}
              y={labelPoint.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-muted-foreground"
              style={{ fontSize: 10 }}
            >
              {a.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
