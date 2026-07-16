"use client";

import * as React from "react";
import { motion, useMotionValue, useSpring, type HTMLMotionProps } from "framer-motion";

import { cn } from "@/lib/utils";

/**
 * MagneticButton — wraps a child (typically <Button>) and nudges it toward
 * the cursor on mouse move within its bounding box, springing back on leave.
 *
 * Usage:
 *   <MagneticButton>
 *     <Button size="lg">Start free trial</Button>
 *   </MagneticButton>
 */

export interface MagneticButtonProps extends HTMLMotionProps<"div"> {
  children: React.ReactNode;
  strength?: number;
}

const MAX_OFFSET = 14;

function MagneticButton({
  children,
  strength = 0.35,
  className,
  ...props
}: MagneticButtonProps) {
  const ref = React.useRef<HTMLDivElement>(null);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 200, damping: 15, mass: 0.4 });
  const springY = useSpring(y, { stiffness: 200, damping: 15, mass: 0.4 });

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const offsetX = event.clientX - (rect.left + rect.width / 2);
    const offsetY = event.clientY - (rect.top + rect.height / 2);

    x.set(clamp(offsetX * strength, -MAX_OFFSET, MAX_OFFSET));
    y.set(clamp(offsetY * strength, -MAX_OFFSET, MAX_OFFSET));
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={ref}
      data-slot="magnetic-button"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ x: springX, y: springY }}
      className={cn("inline-flex", className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export { MagneticButton };
