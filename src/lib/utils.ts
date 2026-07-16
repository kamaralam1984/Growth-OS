import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const RELATIVE_TIME_UNITS: Array<{ unit: Intl.RelativeTimeFormatUnit; seconds: number }> = [
  { unit: "year", seconds: 31536000 },
  { unit: "month", seconds: 2592000 },
  { unit: "week", seconds: 604800 },
  { unit: "day", seconds: 86400 },
  { unit: "hour", seconds: 3600 },
  { unit: "minute", seconds: 60 },
];

const relativeTimeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/**
 * Renders a Date as a short relative-time string ("3 minutes ago", "just
 * now", "2 days ago") for activity feeds / timestamps across the app.
 */
export function formatRelativeTime(date: Date): string {
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absSeconds = Math.abs(seconds);

  if (absSeconds < 60) return "just now";

  for (const { unit, seconds: unitSeconds } of RELATIVE_TIME_UNITS) {
    if (absSeconds >= unitSeconds) {
      const value = Math.round(seconds / unitSeconds);
      return relativeTimeFormatter.format(value, unit);
    }
  }

  return relativeTimeFormatter.format(Math.round(seconds / 60), "minute");
}
