import { AsyncLocalStorage } from 'node:async_hooks';
import { configure, getConsoleSink, ansiColorFormatter, getLogger } from '@logtape/logtape';
import { getWinstonSink } from '@logtape/adaptor-winston';
import winston from 'winston';
import { setProjectId, setContextStorage, detectProjectId } from './context-manager';
import { patchConsole } from './console-patch';
import type { GcpLoggingConfig } from './types';

/**
 * Pre-configured root logger instance.
 *
 * Import and use directly — trace correlation is automatic when
 * running inside `loggerMiddleware()` or `wrapCloudRunFunction()`.
 *
 * ```typescript
 * import { logger } from 'nodejs-gcp-log-correlation';
 * logger.info('Hello');
 * ```
 */
export const logger = getLogger();

// ── Lazy auto-init state ─────────────────────────────────────────────
let configuredOnce = false;
let initPromise: Promise<void> | null = null;

/**
 * Returns true if the library has been configured.
 * @internal Used by middleware to take a synchronous fast-path.
 */
export function isConfigured(): boolean {
  return configuredOnce;
}

/**
 * Ensure the library is configured. If `configureGcpLogging()` was never
 * called explicitly, this initialises with default options (auto-detected
 * project ID, `NODE_ENV`-based environment, console patching enabled).
 *
 * Safe to call multiple times — only the first invocation does any work.
 *
 * @internal Used by middleware / wrapCloudRunFunction so consumers never
 * need to call `configureGcpLogging()` themselves.
 */
export function ensureConfigured(): Promise<void> {
  return configureGcpLogging();
}

/**
 * Configure LogTape with a GCP-aware Winston sink and implicit context storage.
 *
 * In most cases you **don't need to call this** — `loggerMiddleware()` and
 * `wrapCloudRunFunction()` auto-initialise with sensible defaults (project ID
 * auto-detected from env vars, console patching enabled).
 *
 * Call this explicitly **only** if you need custom options (e.g. a specific
 * `logLevel` or `serviceName`). If you do, call it **once** at application
 * startup, **before** the middleware or any logging runs.
 */
export function configureGcpLogging(options: GcpLoggingConfig = {}): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const projectId = detectProjectId(options.projectId);
    const environment = options.environment || process.env.NODE_ENV || 'development';
    const logLevel = options.logLevel || (environment === 'development' ? 'debug' : 'info');
    const isDev = environment === 'development';

    setProjectId(projectId);

    if (!isDev && !projectId) {
      console.warn('nodejs-gcp-log-correlation: No GCP Project ID detected. Trace correlation may not work properly.');
    }

    // ── Patch global console (default: true) ──────────────────────────
    const colorize = options.colorize !== false && isDev;
    if (options.patchConsole !== false) {
      patchConsole(isDev, colorize);
    }

    // ── Sink selection ────────────────────────────────────────────────
    const contextLocalStorage = new AsyncLocalStorage<Record<string, unknown>>();
    setContextStorage(contextLocalStorage);

    if (isDev) {
      // Dev: use LogTape's native console sink with ANSI colors (no Winston needed)
      await configure({
        sinks: {
          console: getConsoleSink({
            formatter: colorize ? ansiColorFormatter : undefined,
          }),
        },
        loggers: [
          { category: [], sinks: ['console'], lowestLevel: mapToLogtapeLevel(logLevel) },
          { category: ['logtape', 'meta'], sinks: ['console'], lowestLevel: 'warning' },
        ],
        contextLocalStorage,
      });
    } else {
      // Production: GCP Cloud Logging via stdout JSON
      const winstonLogger = winston.createLogger({
        level: logLevel,
        transports: [
          new winston.transports.Console({
            format: winston.format.printf(info => {
              const { level, message, ...meta } = info;

              // Map Winston levels to GCP severity
              const severityMap: Record<string, string> = {
                silly: 'DEFAULT',
                trace: 'DEBUG',
                debug: 'DEBUG',
                verbose: 'DEBUG',
                info: 'INFO',
                warn: 'WARNING',
                warning: 'WARNING',
                error: 'ERROR',
                fatal: 'CRITICAL',
                critical: 'CRITICAL',
              };

              const gcpLogEntry: Record<string, unknown> = {
                severity: severityMap[level] || 'INFO',
                message,
                ...meta,
              };

              if (options.serviceName) {
                gcpLogEntry.serviceContext = { service: options.serviceName };
              }

              return JSON.stringify(gcpLogEntry);
            }),
          }),
        ],
      });

      await configure({
        sinks: {
          gcp: getWinstonSink(winstonLogger),
        },
        loggers: [
          { category: [], sinks: ['gcp'], lowestLevel: mapToLogtapeLevel(logLevel) },
          { category: ['logtape', 'meta'], sinks: ['gcp'], lowestLevel: 'warning' },
        ],
        contextLocalStorage,
      });
    }

    configuredOnce = true;
  })();

  return initPromise;
}

// ── Helpers ───────────────────────────────────────────────────────────

type LogtapeLevel = 'trace' | 'debug' | 'info' | 'warning' | 'error' | 'fatal';

function mapToLogtapeLevel(level: string): LogtapeLevel {
  const map: Record<string, LogtapeLevel> = {
    silly: 'trace',
    trace: 'trace',
    debug: 'debug',
    verbose: 'info',
    info: 'info',
    warn: 'warning',
    warning: 'warning',
    error: 'error',
    fatal: 'fatal',
    critical: 'fatal',
  };
  return map[level] ?? 'info';
}
