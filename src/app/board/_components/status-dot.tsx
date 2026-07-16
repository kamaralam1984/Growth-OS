"use client";

import { motion } from "framer-motion";

import { cn } from "@/lib/utils";
import { glowPulse } from "@/animations";

export interface StatusDotProps {
  /** Whether the thing this dot represents is actively "live" right now. */
  active?: boolean;
  className?: string;
}

/**
 * Small pulsing dot used to signal something real is happening live right
 * now — a LIVE meeting, or an agent whose AIAgentInstance.status is one of
 * the "working" states (THINKING/RESEARCHING/PLANNING/ANALYZING). Renders as
 * a static muted dot when `active` is false so idle/completed states don't
 * fake activity.
 */
export function StatusDot({ active = true, className }: StatusDotProps) {
  if (!active) {
    return <span className={cn("inline-block size-2 rounded-full bg-muted-foreground/40", className)} />;
  }

  return (
    <motion.span
      animate={glowPulse.animate}
      className={cn("inline-block size-2 rounded-full bg-primary shadow-glow-primary", className)}
    />
  );
}
