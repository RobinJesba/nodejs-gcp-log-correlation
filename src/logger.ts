import { AsyncLocalStorage } from 'node:async_hooks';
import { configure } from '@logtape/logtape';
import { getWinstonSink } from '@logtape/adaptor-winston';
import winston from 'winston';
import { LoggingWinston } from '@google-cloud/logging-winston';
import { setProjectId, setContextStorage, detectProjectId } from './context-manager';
import { patchConsole } from './console-patch';
import { getLogger } from '@logtape/logtape';
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
  if (configuredOnce) return Promise.resolve();
  if (!initPromise) {
    initPromise = configureGcpLogging();
  }
  return initPromise;
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
export async function configureGcpLogging(options: GcpLoggingConfig = {}): Promise<void> {
  const projectId = await detectProjectId(options.projectId);
  const environment = options.environment || process.env.NODE_ENV || 'development';
  const logLevel = options.logLevel || (environment === 'development' ? 'debug' : 'info');
  const isDev = environment === 'development';

  setProjectId(projectId);

  if (!isDev && !projectId) {
    console.warn('nodejs-gcp-log-correlation: No GCP Project ID detected. Trace correlation may not work properly.');
  }

  // ── Patch global console (default: true) ──────────────────────────
  if (options.patchConsole !== false) {
    patchConsole(isDev);
  }

  // ── Winston logger ────────────────────────────────────────────────
  const winstonLogger = isDev
    ? winston.createLogger({
        level: logLevel,
        transports: [new winston.transports.Console()],
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.printf(({ level, message, timestamp, ...meta }) => {
            const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
            return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
          }),
        ),
      })
    : winston.createLogger({
        level: logLevel,
        transports: [
          new LoggingWinston({
            projectId,
            serviceContext: options.serviceName ? { service: options.serviceName } : undefined,
          }),
        ],
        format: winston.format.json(),
      });

  // ── LogTape configuration ─────────────────────────────────────────
  const contextLocalStorage = new AsyncLocalStorage<Record<string, unknown>>();
  setContextStorage(contextLocalStorage);

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

  configuredOnce = true;
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
