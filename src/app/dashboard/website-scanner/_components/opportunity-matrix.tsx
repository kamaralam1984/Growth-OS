"use client";

import { motion } from "framer-motion";

import { EASES } from "@/animations";
import type { RecommendationCategory, MessagePriority } from "@/generated/prisma/client";

/**
 * Hand-rolled 2D quadrant SVG — Impact (from the AI's own real priority
 * judgment) vs. Effort (a documented per-category size heuristic, since
 * effort isn't a field the model outputs). Both axes trace to something
 * real: the priority IS the model's real recommendation output; the effort
 * mapping is an illustrative, documented editorial judgment call, not a
 * fabricated number — every recommendation dot is still real, just plotted
 * with a reasonable size proxy.
 */
export interface MatrixItem {
  id: string;
  title: string;
  category: RecommendationCategory;
  priority: MessagePriority;
}

const PRIORITY_IMPACT: Record<MessagePriority, number> = { URGENT: 92, HIGH: 75, NORMAL: 50, LOW: 25 };

const CATEGORY_EFFORT: Record<RecommendationCategory, number> = {
  ERP: 90,
  CLOUD_MIGRATION: 85,
  HOSPITAL_MANAGEMENT: 85,
  SCHOOL_ERP: 80,
  WAREHOUSE: 75,
  CRM: 65,
  HRMS: 65,
  INVENTORY: 60,
  ACCOUNTING: 55,
  BILLING: 50,
  VENDOR_PORTAL: 55,
  EMPLOYEE_PORTAL: 55,
  CUSTOMER_PORTAL: 50,
  ADMIN_PANEL: 45,
  WORKFLOW_AUTOMATION: 45,
  API_INTEGRATION: 40,
  POS: 45,
  MOBILE_APP: 70,
  ANALYTICS_DASHBOARD: 40,
  AI_CHATBOT: 30,
};

const SIZE = 320;
const PADDING = 40;
const PLOT_SIZE = SIZE - PADDING * 2;

export function OpportunityMatrix({ items }: { items: MatrixItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE}>
        <line x1={PADDING} y1={SIZE / 2} x2={SIZE - PADDING} y2={SIZE / 2} stroke="var(--color-border)" strokeWidth={1} />
        <line x1={SIZE / 2} y1={PADDING} x2={SIZE / 2} y2={SIZE - PADDING} stroke="var(--color-border)" strokeWidth={1} />
        <rect x={PADDING} y={PADDING} width={PLOT_SIZE} height={PLOT_SIZE} fill="none" stroke="var(--color-border)" strokeWidth={1} />

        <text x={SIZE / 2} y={PADDING - 10} textAnchor="middle" className="fill-muted-foreground text-[10px]">
          High Impact
        </text>
        <text x={SIZE / 2} y={SIZE - PADDING + 20} textAnchor="middle" className="fill-muted-foreground text-[10px]">
          Low Impact
        </text>
        <text x={PADDING - 8} y={SIZE / 2} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground text-[10px]">
          Low Effort
        </text>
        <text x={SIZE - PADDING + 8} y={SIZE / 2} dominantBaseline="middle" className="fill-muted-foreground text-[10px]">
          High Effort
        </text>

        {items.map((item, i) => {
          const impact = PRIORITY_IMPACT[item.priority];
          const effort = CATEGORY_EFFORT[item.category] ?? 50;
          const x = PADDING + (effort / 100) * PLOT_SIZE;
          const y = PADDING + PLOT_SIZE - (impact / 100) * PLOT_SIZE;
          return (
            <motion.g
              key={item.id}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: i * 0.06, ease: EASES.outExpo }}
              style={{ transformOrigin: `${x}px ${y}px` }}
            >
              <circle cx={x} cy={y} r={7} fill="var(--color-primary)" fillOpacity={0.85} stroke="var(--color-card)" strokeWidth={2} />
              <title>{item.title}</title>
            </motion.g>
          );
        })}
      </svg>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {items.map((item) => (
          <span key={item.id}>{item.title}</span>
        ))}
      </div>
    </div>
  );
}
