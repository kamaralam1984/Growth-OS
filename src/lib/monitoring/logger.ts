/**
 * Lightweight structured-logging helper — real JSON-line stdout for a
 * hosting platform's log drain (Vercel/Render/Fly/Railway/etc. all ingest
 * plain stdout and parse JSON lines automatically), NOT a full logging
 * framework migration. This app leans on plain `console.error`/`console.log`
 * everywhere already; this thin wrapper just makes those lines greppable/
 * parseable (one JSON object per line, a stable `level`/`message`/
 * `timestamp` shape) without introducing pino or any other heavy
 * dependency. Use it for new operational/monitoring code paths
 * (src/lib/monitoring/*, src/lib/ops/*); it deliberately does not replace
 * every existing console.error call site in this app — that would be a
 * much larger, separate migration outside this task's scope.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  [key: string]: unknown;
}

function write(level: LogLevel, message: string, context?: LogContext): void {
  const line = JSON.stringify({
    level,
    message,
    ...context,
    timestamp: new Date().toISOString(),
  });

  // Errors/warnings go to stderr (console.error/warn) so they're separable
  // from normal request logs by any log drain that distinguishes streams;
  // everything else goes to stdout.
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, context?: LogContext): void => write("debug", message, context),
  info: (message: string, context?: LogContext): void => write("info", message, context),
  warn: (message: string, context?: LogContext): void => write("warn", message, context),
  error: (message: string, context?: LogContext): void => write("error", message, context),
};
