"use client";

import { motion } from "framer-motion";

import { EASES } from "@/animations";

/** Hand-rolled semi-circle SVG gauge for a single 0-100 score — no charting library, same dependency-free style as line-trend.tsx/bar-trend.tsx. */
export interface ScoreGaugeProps {
  score: number;
  label: string;
  size?: number;
}

const RADIUS = 80;
const STROKE = 16;
const CENTER = 100;

function polarToCartesian(angleDeg: number): { x: number; y: number } {
  const angleRad = (angleDeg * Math.PI) / 180;
  return { x: CENTER + RADIUS * Math.cos(angleRad), y: CENTER + RADIUS * Math.sin(angleRad) };
}

function arcPath(startAngle: number, endAngle: number): string {
  const start = polarToCartesian(startAngle);
  const end = polarToCartesian(endAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function scoreColor(score: number): string {
  if (score >= 70) return "var(--color-primary)";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
}

export function ScoreGauge({ score, label, size = 200 }: ScoreGaugeProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const sweep = 180 * (clamped / 100);

  return (
    <div className="flex flex-col items-center gap-1" style={{ width: size }}>
      <svg viewBox="0 0 200 110" width={size} height={size * 0.55} role="img" aria-label={`${label}: ${clamped} out of 100`}>
        <path d={arcPath(180, 360)} stroke="var(--color-muted)" strokeWidth={STROKE} fill="none" strokeLinecap="round" />
        <motion.path
          d={arcPath(180, 180 + sweep)}
          stroke={scoreColor(clamped)}
          strokeWidth={STROKE}
          fill="none"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, ease: EASES.outExpo }}
        />
        <text x={CENTER} y={CENTER - 8} textAnchor="middle" className="fill-foreground text-3xl font-semibold">
          {clamped}
        </text>
      </svg>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
