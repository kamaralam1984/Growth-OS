/**
 * Real, client-side-only composite device fingerprint: a SHA-256 hash of
 * four real signals the browser exposes (timezone, screen resolution,
 * platform, and the number of logical CPU cores) — collected in
 * `DeviceFingerprintReporter` (src/app/dashboard/_components/device-fingerprint-reporter.tsx)
 * and submitted once per browser session via `submitDeviceFingerprint`
 * (src/app/dashboard/_lib/device-fingerprint-actions.ts) so it lands
 * alongside the existing DeviceSession row for this sign-in.
 *
 * This is explicitly NOT a strong anti-fraud fingerprint (no canvas/WebGL/
 * audio entropy, no font enumeration) — those techniques are far more
 * invasive and easily flagged as tracking by privacy tools. It's a modest,
 * honest improvement over the existing userId+userAgent heuristic alone: a
 * User-Agent string is identical across every install of the same browser/
 * OS combination, so it can't distinguish two different physical machines;
 * this at least can, for the subset of users whose browser doesn't spoof or
 * block these specific values. Never used as a sole gate on anything —
 * only stored as an extra comparison signal on the DeviceSession row.
 */
export function collectDeviceFingerprintInputs(): string {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown";
  const screenResolution =
    typeof screen !== "undefined" ? `${screen.width}x${screen.height}x${screen.colorDepth}` : "unknown";
  const platform = typeof navigator !== "undefined" ? navigator.platform || "unknown" : "unknown";
  const hardwareConcurrency =
    typeof navigator !== "undefined" && typeof navigator.hardwareConcurrency === "number"
      ? String(navigator.hardwareConcurrency)
      : "unknown";

  return [timezone, screenResolution, platform, hardwareConcurrency].join("|");
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Computes the real fingerprint hash for the current browser. Only callable
 * client-side (uses `screen`/`navigator`/`crypto.subtle`, none of which
 * exist in a server rendering context).
 */
export async function computeDeviceFingerprint(): Promise<string> {
  return sha256Hex(collectDeviceFingerprintInputs());
}
