"use client";

import { useEffect } from "react";

import { computeDeviceFingerprint } from "@/lib/device-fingerprint";
import { submitDeviceFingerprint } from "../_lib/device-fingerprint-actions";

const SESSION_STORAGE_KEY = "kvl-device-fingerprint-submitted";

/**
 * Invisible: computes this browser's real device fingerprint (timezone,
 * screen resolution, platform, hardwareConcurrency — see
 * src/lib/device-fingerprint.ts) once per browser tab session and submits
 * it to attach to this sign-in's DeviceSession row. Mounted once in
 * src/app/dashboard/layout.tsx so every authenticated user picks it up
 * without every individual page needing to remember to.
 *
 * The sessionStorage guard avoids re-submitting on every client-side
 * navigation within the same tab (this layout persists across those, so in
 * practice this only ever runs once per real tab/session anyway, but the
 * guard also survives a case where the guard is removed by a caller
 * re-mounting the layout, e.g. a full page reload — matching "once per
 * browser session" rather than "once ever" or "on every render").
 */
export function DeviceFingerprintReporter() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(SESSION_STORAGE_KEY)) return;

    let cancelled = false;
    void (async () => {
      try {
        const fingerprint = await computeDeviceFingerprint();
        if (cancelled) return;
        await submitDeviceFingerprint(fingerprint);
        window.sessionStorage.setItem(SESSION_STORAGE_KEY, "1");
      } catch (error) {
        console.error("[device-fingerprint-reporter] failed to submit fingerprint:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
