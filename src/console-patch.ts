import { format } from 'node:util';
import { getFullTraceContext } from './context-manager';

// ── Original console methods (captured once, before patching) ────────
const originals = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
};

const severityMap: Record<string, string> = {
  log: 'INFO',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  debug: 'DEBUG',
};

/**
 * Monkey-patch the global `console` methods so that **every** call —
 * including those from third-party dependencies you don't control —
 * automatically includes GCP trace correlation fields.
 *
 * - **Production**: outputs a single-line JSON object to stdout/stderr with
 *   `severity`, `message`, `logging.googleapis.com/trace`, and
 *   `logging.googleapis.com/spanId`. Cloud Logging parses this and correlates
 *   the entry with the parent request trace.
 * - **Development**: prepends a short `[trace:<id>]` tag for easy visual
 *   correlation without cluttering the output.
 *
 * Calls that occur **outside** a traced context are forwarded to the
 * original console method unchanged.
 *
 * @internal Called automatically by `configureGcpLogging()`.
 */
export function patchConsole(isDev: boolean): void {
  for (const method of Object.keys(originals) as Array<keyof typeof originals>) {
    const original = originals[method];
    const severity = severityMap[method];

    console[method] = (...args: any[]): void => {
      const ctx = getFullTraceContext();

      // No active trace — pass through untouched
      if (!ctx.trace) {
        original(...args);
        return;
      }

      if (isDev) {
        // Dev: human-readable tag
        const shortTrace = ctx.trace.split('/').pop();
        original(`[trace:${shortTrace}]`, ...args);
        return;
      }

      // Production: structured JSON for GCP Cloud Logging
      const entry: Record<string, unknown> = {
        severity,
        message: format(...args),
        'logging.googleapis.com/trace': ctx.trace,
      };
      if (ctx.spanId) {
        entry['logging.googleapis.com/spanId'] = ctx.spanId;
      }

      const line = JSON.stringify(entry) + '\n';
      if (method === 'error' || method === 'warn') {
        process.stderr.write(line);
      } else {
        process.stdout.write(line);
      }
    };
  }
}

/**
 * Restore the original (unpatched) console methods.
 * Useful in tests or when tearing down the logging configuration.
 */
export function restoreConsole(): void {
  for (const method of Object.keys(originals) as Array<keyof typeof originals>) {
    console[method] = originals[method];
  }
}
