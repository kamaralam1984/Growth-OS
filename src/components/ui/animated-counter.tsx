"use client";

import * as React from "react";
import { useInView, useMotionValue, useSpring } from "framer-motion";

import { DURATIONS } from "@/animations";

export interface AnimatedCounterProps {
  value: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
  /** Number of decimal places to render, e.g. 1 for "4.5". Defaults to 0. */
  decimals?: number;
}

/**
 * Count-up number that animates from 0 to `value` once it scrolls into
 * view. Uses a spring-driven motion value so the animation feels natural
 * rather than linear.
 */
function AnimatedCounter({
  value,
  prefix = "",
  suffix = "",
  duration = DURATIONS.slower,
  className,
  decimals = 0,
}: AnimatedCounterProps) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  const [display, setDisplay] = React.useState(() =>
    formatValue(0, decimals),
  );

  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, {
    duration,
    bounce: 0,
  });

  React.useEffect(() => {
    if (isInView) {
      motionValue.set(value);
    }
  }, [isInView, motionValue, value]);

  React.useEffect(() => {
    const unsubscribe = springValue.on("change", (latest) => {
      setDisplay(formatValue(latest, decimals));
    });
    return unsubscribe;
  }, [springValue, decimals]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {display}
      {suffix}
    </span>
  );
}

function formatValue(value: number, decimals: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export { AnimatedCounter };
