"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { toast } from "@/components/ui/toast";
import { splitTimeEntryForIdle, resolveIdleTimeEntry } from "../actions";

/**
 * The only real, standards-track "was this user idle" signal the web
 * platform exposes is the IdleDetector API — permission-gated and, as of
 * this API's spec status, Chromium-only (no Firefox/Safari support, and
 * requestPermission() itself can reject outside a user gesture). It is
 * used opportunistically below because, unlike DOM listeners, it can catch
 * true OS-level idle (screen lock, screensaver) with zero mouse/keyboard
 * activity in the tab. Every browser and every denied/failed permission
 * prompt falls back to the activity-listener heuristic — that fallback,
 * not IdleDetector, is what most users actually get. Never assume
 * universal idle detection.
 */
const IDLE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes of no mouse/keyboard/scroll/click — long enough that reading a doc without touching the mouse doesn't false-positive, short enough that idle gaps still get caught same-session.
const ACTIVITY_POLL_MS = 30 * 1000;
const ACTIVITY_EVENTS = ["mousemove", "keydown", "scroll", "click"] as const;

interface IdleDetectorHandle {
  addEventListener(type: "change", listener: () => void): void;
  start(options: { threshold: number; signal?: AbortSignal }): Promise<void>;
  readonly userState: "active" | "idle";
}

interface IdleDetectorConstructor {
  new (): IdleDetectorHandle;
  requestPermission(): Promise<"granted" | "denied" | "prompt">;
}

function getIdleDetectorCtor(): IdleDetectorConstructor | null {
  if (typeof window === "undefined" || !("IdleDetector" in window)) return null;
  return (window as unknown as { IdleDetector: IdleDetectorConstructor }).IdleDetector;
}

function formatAwayMinutes(sinceIso: string): number {
  return Math.max(1, Math.round((Date.now() - new Date(sinceIso).getTime()) / 60_000));
}

/**
 * Mounted only while a timer is running for this project (see
 * timer-widget.tsx). Drives the whole idle lifecycle off the running
 * entry's own `source`: while it's TIMER/AUTO, watches for idle and splits
 * it; once it's IDLE (meaning splitTimeEntryForIdle already ran and this
 * *is* the idle entry), watches for resumed activity and prompts the user.
 */
export function IdleTracker({ entryId, entryStartedAt, entrySource }: { entryId: string; entryStartedAt: string; entrySource: string }) {
  const router = useRouter();
  const isIdleEntry = entrySource === "IDLE";
  const lastActivityRef = useRef(0);
  const splittingRef = useRef(false);

  useEffect(() => {
    if (isIdleEntry) return;
    splittingRef.current = false;
    lastActivityRef.current = Date.now();

    function triggerSplit(lastActiveAtMs: number) {
      if (splittingRef.current) return;
      splittingRef.current = true;
      splitTimeEntryForIdle(entryId, new Date(lastActiveAtMs).toISOString()).then((result) => {
        if (result.ok) router.refresh();
        else splittingRef.current = false;
      });
    }

    function markActive() {
      lastActivityRef.current = Date.now();
    }

    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, markActive, { passive: true }));
    const pollInterval = setInterval(() => {
      if (Date.now() - lastActivityRef.current >= IDLE_THRESHOLD_MS) triggerSplit(lastActivityRef.current);
    }, ACTIVITY_POLL_MS);

    const idleDetectorCtor = getIdleDetectorCtor();
    const controller = new AbortController();
    if (idleDetectorCtor) {
      idleDetectorCtor
        .requestPermission()
        .then((permission) => {
          if (permission !== "granted" || controller.signal.aborted) return;
          const detector = new idleDetectorCtor();
          detector.addEventListener("change", () => {
            if (detector.userState === "idle") triggerSplit(Date.now() - IDLE_THRESHOLD_MS);
          });
          return detector.start({ threshold: IDLE_THRESHOLD_MS, signal: controller.signal });
        })
        .catch(() => {
          // Unsupported, permission denied, or requestPermission() rejected
          // outside a user gesture — the activity-listener fallback above
          // already covers this session regardless.
        });
    }

    return () => {
      controller.abort();
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, markActive));
      clearInterval(pollInterval);
    };
  }, [isIdleEntry, entryId, router]);

  useEffect(() => {
    if (!isIdleEntry) return;
    let resolved = false;

    function cleanup() {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, handleResume));
    }

    function resolve(action: "keep" | "discard") {
      if (resolved) return;
      resolved = true;
      resolveIdleTimeEntry(entryId, action).then((result) => {
        if (result.ok) router.refresh();
      });
    }

    function handleResume() {
      if (resolved) return;
      cleanup();
      const awayMinutes = formatAwayMinutes(entryStartedAt);
      toast(`You were away for ${awayMinutes} minute${awayMinutes === 1 ? "" : "s"}`, {
        description: "Keep this as tracked time, or discard it?",
        duration: Infinity,
        action: { label: "Keep", onClick: () => resolve("keep") },
        cancel: { label: "Discard", onClick: () => resolve("discard") },
      });
    }

    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, handleResume, { passive: true }));
    return cleanup;
  }, [isIdleEntry, entryId, entryStartedAt, router]);

  return null;
}
