"use client";

import { useEffect } from "react";

import { trackMarketingEvent } from "@/lib/client/track-marketing-event";

const THRESHOLDS = [25, 50, 75, 100] as const;

/** Fires a SCROLL_DEPTH marketing event once per threshold per page load. */
export function useScrollDepthTracking(page: string): void {
  useEffect(() => {
    const fired = new Set<number>();

    function handleScroll() {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollable <= 0) return;
      const percent = (window.scrollY / scrollable) * 100;

      for (const threshold of THRESHOLDS) {
        if (percent >= threshold && !fired.has(threshold)) {
          fired.add(threshold);
          trackMarketingEvent("SCROLL_DEPTH", page, undefined, { depth: threshold });
        }
      }
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [page]);
}
