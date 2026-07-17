"use client";

import { motion } from "framer-motion";

import { EASES } from "@/animations";

/** Hand-rolled polar-coordinate SVG radar chart — no charting library, mirrors line-trend.tsx/bar-trend.tsx's dependency-free style. */
export interface RadarAxis {
  label: string;
  value: number; // 0-100
}

const SIZE = 280;
const CENTER = SIZE / 2;
const MAX_RADIUS = 100;
const RINGS = [25, 50, 75, 100];

function pointFor(index: number, total: number, value: number): { x: number; y: number } {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  const r = (value / 100) * MAX_RADIUS;
  return { x: CENTER + r * Math.cos(angle), y: CENTER + r * Math.sin(angle) };
}

export function RadarChart({ axes }: { axes: RadarAxis[] }) {
  const total = axes.length;
  const dataPoints = axes.map((a, i) => pointFor(i, total, a.value));
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";
  const ariaLabel = `Radar chart with ${axes.length} dimensions: ${axes.map((a) => `${a.label} ${Math.round(a.value)}/100`).join(", ")}`;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img" aria-label={ariaLabel}>
        {RINGS.map((r) => (
          <circle key={r} cx={CENTER} cy={CENTER} r={(r / 100) * MAX_RADIUS} fill="none" stroke="var(--color-border)" strokeWidth={1} />
        ))}
        {axes.map((axis, i) => {
          const edge = pointFor(i, total, 100);
          const labelPoint = pointFor(i, total, 118);
          return (
            <g key={axis.label}>
              <line x1={CENTER} y1={CENTER} x2={edge.x} y2={edge.y} stroke="var(--color-border)" strokeWidth={1} />
              <text x={labelPoint.x} y={labelPoint.y} textAnchor="middle" dominantBaseline="middle" className="fill-muted-foreground text-[10px]">
                {axis.label}
              </text>
            </g>
          );
        })}
        <motion.path
          d={dataPath}
          fill="var(--color-primary)"
          fillOpacity={0.18}
          stroke="var(--color-primary)"
          strokeWidth={2}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: EASES.outExpo }}
          style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
        />
        {dataPoints.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3.5} fill="var(--color-primary)">
            <title>
              {axes[i].label}: {axes[i].value}
            </title>
          </circle>
        ))}
      </svg>
    </div>
  );
}
