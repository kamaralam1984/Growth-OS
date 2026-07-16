"use client";

import * as React from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type HTMLMotionProps,
} from "framer-motion";

import { cn } from "@/lib/utils";

/**
 * TiltCard — wraps Card-based content with a subtle 3D tilt + cursor glare.
 *
 * Usage:
 *   <TiltCard>
 *     <Card className="p-6">...</Card>
 *   </TiltCard>
 */

export interface TiltCardProps extends HTMLMotionProps<"div"> {
  children: React.ReactNode;
  maxTilt?: number;
}

function TiltCard({ children, maxTilt = 7, className, style, ...props }: TiltCardProps) {
  const ref = React.useRef<HTMLDivElement>(null);

  const pointerX = useMotionValue(0.5);
  const pointerY = useMotionValue(0.5);

  const springConfig = { stiffness: 220, damping: 20, mass: 0.5 };
  const rotateX = useSpring(
    useTransform(pointerY, [0, 1], [maxTilt, -maxTilt]),
    springConfig,
  );
  const rotateY = useSpring(
    useTransform(pointerX, [0, 1], [-maxTilt, maxTilt]),
    springConfig,
  );

  const glareX = useTransform(pointerX, (v) => `${v * 100}%`);
  const glareY = useTransform(pointerY, (v) => `${v * 100}%`);
  const glareOpacity = useMotionValue(0);
  const glareBackground = useTransform(
    [glareX, glareY],
    ([gx, gy]: string[]) =>
      `radial-gradient(320px circle at ${gx} ${gy}, color-mix(in srgb, white 12%, transparent), transparent 70%)`,
  );

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    pointerX.set((event.clientX - rect.left) / rect.width);
    pointerY.set((event.clientY - rect.top) / rect.height);
  };

  const handleMouseEnter = () => glareOpacity.set(1);

  const handleMouseLeave = () => {
    pointerX.set(0.5);
    pointerY.set(0.5);
    glareOpacity.set(0);
  };

  return (
    <motion.div
      ref={ref}
      data-slot="tilt-card"
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateX,
        rotateY,
        transformPerspective: 1000,
        ...style,
      }}
      className={cn("relative", className)}
      {...props}
    >
      {children}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{
          opacity: glareOpacity,
          background: glareBackground,
        }}
      />
    </motion.div>
  );
}

export { TiltCard };
