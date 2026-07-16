"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { DURATIONS } from "@/animations";

/**
 * AnnouncementBar — slim dismissible top banner.
 *
 * Usage:
 *   <AnnouncementBar
 *     message="GrowthOS 2.0 is here — autonomous follow-up sequencing."
 *     ctaLabel="See what's new"
 *     ctaHref="/changelog"
 *   />
 */

export interface AnnouncementBarProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onClick"> {
  message: React.ReactNode;
  ctaLabel?: string;
  ctaHref?: string;
  onDismiss?: () => void;
  glass?: boolean;
}

function AnnouncementBar({
  message,
  ctaLabel,
  ctaHref = "#",
  onDismiss,
  glass = false,
  className,
  ...props
}: AnnouncementBarProps) {
  const [dismissed, setDismissed] = React.useState(false);

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  return (
    <AnimatePresence initial={false}>
      {!dismissed && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: DURATIONS.base }}
          className="overflow-hidden"
        >
          <div
            data-slot="announcement-bar"
            className={cn(
              "relative flex w-full items-center justify-center gap-2 px-4 py-2.5 text-center text-sm",
              glass
                ? "glass-panel-strong text-foreground"
                : "bg-primary text-primary-foreground",
              className,
            )}
            {...props}
          >
            <span className="text-balance font-medium">{message}</span>
            {ctaLabel && (
              <a
                href={ctaHref}
                className="inline-flex shrink-0 items-center gap-1 font-semibold underline-offset-4 hover:underline"
              >
                {ctaLabel}
                <ArrowRight className="size-3.5" aria-hidden />
              </a>
            )}
            <button
              type="button"
              aria-label="Dismiss announcement"
              onClick={handleDismiss}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export { AnnouncementBar };
