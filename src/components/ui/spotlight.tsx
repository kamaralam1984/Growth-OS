"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Spotlight — "mouse lighting" effect wrapper for hero/dark sections.
 * Tracks pointer position and exposes it as CSS custom properties consumed
 * by an absolutely positioned radial-gradient child.
 *
 * Usage:
 *   <Spotlight className="rounded-2xl border border-border">
 *     <div className="relative z-10 p-10">...content...</div>
 *   </Spotlight>
 */

export interface SpotlightProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: number;
  color?: string;
}

function Spotlight({
  children,
  className,
  size = 400,
  color = "var(--primary)",
  ...props
}: SpotlightProps) {
  const ref = React.useRef<HTMLDivElement>(null);

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    el.style.setProperty("--spotlight-x", `${event.clientX - rect.left}px`);
    el.style.setProperty("--spotlight-y", `${event.clientY - rect.top}px`);
  };

  return (
    <div
      ref={ref}
      data-slot="spotlight"
      onMouseMove={handleMouseMove}
      className={cn("relative isolate overflow-hidden", className)}
      style={
        {
          "--spotlight-x": "50%",
          "--spotlight-y": "50%",
        } as React.CSSProperties
      }
      {...props}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 transition-opacity duration-300"
        style={{
          background: `radial-gradient(${size}px circle at var(--spotlight-x) var(--spotlight-y), color-mix(in srgb, ${color} 15%, transparent), transparent 70%)`,
        }}
      />
      {children}
    </div>
  );
}

export { Spotlight };
