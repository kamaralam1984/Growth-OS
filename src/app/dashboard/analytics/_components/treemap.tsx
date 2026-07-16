const PALETTE = ["var(--color-primary)", "#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#a855f7", "#14b8a6"];

interface TreemapNode {
  label: string;
  value: number;
}

/** Simple slice-and-dice treemap — alternates horizontal/vertical splits proportional to value. No layout library. */
export function Treemap({ nodes, formatValue }: { nodes: TreemapNode[]; formatValue: (value: number) => string }) {
  const total = nodes.reduce((sum, n) => sum + n.value, 0);

  if (nodes.length === 0 || total <= 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No won deals yet.</p>;
  }

  const width = 400;
  const height = 220;

  function slice(items: TreemapNode[], x: number, y: number, w: number, h: number, horizontal: boolean): Array<{ item: TreemapNode; x: number; y: number; w: number; h: number }> {
    if (items.length === 0) return [];
    if (items.length === 1) return [{ item: items[0], x, y, w, h }];

    const subtotal = items.reduce((sum, n) => sum + n.value, 0);
    const [head, ...rest] = items;
    const headShare = head.value / subtotal;

    if (horizontal) {
      const headW = w * headShare;
      return [
        { item: head, x, y, w: headW, h },
        ...slice(rest, x + headW, y, w - headW, h, !horizontal),
      ];
    }
    const headH = h * headShare;
    return [
      { item: head, x, y, w, h: headH },
      ...slice(rest, x, y + headH, w, h - headH, !horizontal),
    ];
  }

  const sorted = [...nodes].sort((a, b) => b.value - a.value);
  const rects = slice(sorted, 0, 0, width, height, true);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img">
      {rects.map((r, i) => (
        <g key={r.item.label}>
          <rect
            x={r.x}
            y={r.y}
            width={Math.max(r.w - 1, 0)}
            height={Math.max(r.h - 1, 0)}
            fill={PALETTE[i % PALETTE.length]}
            fillOpacity={0.85}
            rx={3}
          >
            <title>
              {r.item.label}: {formatValue(r.item.value)}
            </title>
          </rect>
          {r.w > 60 && r.h > 24 && (
            <text x={r.x + 6} y={r.y + 16} className="fill-white" style={{ fontSize: 11, fontWeight: 600 }}>
              {r.item.label.length > 18 ? `${r.item.label.slice(0, 16)}…` : r.item.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
