"use client";

import * as React from "react";
import { AnimatePresence, motion, type HTMLMotionProps } from "framer-motion";

import { cn } from "@/lib/utils";
import { DURATIONS } from "@/animations";

/**
 * Tooltip — lightweight hover/focus-triggered tooltip, fixed "above" position.
 *
 * Usage:
 *   <Tooltip>
 *     <TooltipTrigger asChild>
 *       <Button variant="ghost" size="sm">Hover me</Button>
 *     </TooltipTrigger>
 *     <TooltipContent>Runs 24/7, no supervision needed.</TooltipContent>
 *   </Tooltip>
 */

interface TooltipContextValue {
  open: boolean;
  show: () => void;
  hide: () => void;
}

const TooltipContext = React.createContext<TooltipContextValue | null>(null);

function useTooltipContext(component: string) {
  const ctx = React.useContext(TooltipContext);
  if (!ctx) {
    throw new Error(`${component} must be used within <Tooltip>`);
  }
  return ctx;
}

export interface TooltipProps {
  children: React.ReactNode;
  openDelay?: number;
}

function Tooltip({ children, openDelay = 100 }: TooltipProps) {
  const [open, setOpen] = React.useState(false);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = React.useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setOpen(true), openDelay);
  }, [openDelay]);

  const hide = React.useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(false);
  }, []);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <TooltipContext.Provider value={{ open, show, hide }}>
      <span className="relative inline-flex">{children}</span>
    </TooltipContext.Provider>
  );
}

export interface TooltipTriggerProps {
  children: React.ReactElement<Record<string, unknown>>;
  asChild?: boolean;
}

function TooltipTrigger({ children }: TooltipTriggerProps) {
  const { show, hide } = useTooltipContext("TooltipTrigger");

  return React.cloneElement(children, {
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
  });
}

export interface TooltipContentProps extends HTMLMotionProps<"div"> {
  side?: "top" | "bottom";
}

function TooltipContent({ className, children, side = "top", ...props }: TooltipContentProps) {
  const { open } = useTooltipContext("TooltipContent");

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="tooltip"
          initial={{ opacity: 0, scale: 0.94, y: side === "top" ? 4 : -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: side === "top" ? 4 : -4 }}
          transition={{ duration: DURATIONS.fast }}
          className={cn(
            "pointer-events-none absolute left-1/2 z-50 w-max max-w-64 -translate-x-1/2 rounded-lg border border-border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-elevated",
            side === "top" ? "bottom-full mb-2" : "top-full mt-2",
            className,
          )}
          {...props}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent };
