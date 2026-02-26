import { withContext } from '@logtape/logtape';
import { TRACE_KEY, SPAN_KEY, getProjectId } from './context-manager';
import { ensureConfigured, isConfigured } from './logger';

/**
 * Express middleware that extracts the GCP trace header and scopes it as
 * LogTape implicit context for the lifetime of the request.
 *
 * Automatically initialises the library on first use if `configureGcpLogging()`
 * was not called explicitly.
 *
 * Every `logger.*` or `console.*` call — in your code **or** in third-party
 * dependencies — will automatically include the trace fields while inside this
 * context.
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { loggerMiddleware, logger } from 'nodejs-gcp-log-correlation';
 *
 * const app = express();
 * app.use(loggerMiddleware());
 *
 * app.get('/', (req, res) => {
 *   logger.info('Request processed');
 *   res.json({ status: 'ok' });
 * });
 *
 * app.listen(8080);
 * ```
 */
export function loggerMiddleware(): (
  req: { header(name: string): string | undefined },
  res: unknown,
  next: (err?: unknown) => void
) => void {
  const ready = ensureConfigured();

  return (req, _res, next): void => {
    const run = () => {
      const traceHeader = req.header('x-cloud-trace-context');
      if (!traceHeader) {
        next();
        return;
      }

      const context = parseTraceHeader(traceHeader);
      withContext(context, () => {
        next();
      });
    };

    if (isConfigured()) {
      run();
    } else {
      ready.then(run).catch(next);
    }
  };
}

/**
 * Wrap a Cloud Run function handler so that the GCP trace context is
 * automatically propagated through the entire function execution.
 *
 * Automatically initialises the library on first use if `configureGcpLogging()`
 * was not called explicitly.
 *
 * @example
 * ```typescript
 * import { wrapCloudRunFunction, logger } from 'nodejs-gcp-log-correlation';
 *
 * export const handler = wrapCloudRunFunction((req, res) => {
 *   logger.info('Function executed');
 *   res.send('Done!');
 * });
 * ```
 */
export function wrapCloudRunFunction<T extends (...args: any[]) => any>(fn: T): T {
  const ready = ensureConfigured();

  return ((...args: any[]): any => {
    const run = () => {
      const req = args[0] as Record<string, any>;
      const traceHeader: string | undefined =
        req.header?.('x-cloud-trace-context') ?? req.headers?.['x-cloud-trace-context'];

      if (!traceHeader) {
        return fn(...args);
      }

      const headerValue = Array.isArray(traceHeader) ? traceHeader[0] : traceHeader;
      const context = parseTraceHeader(headerValue);
      return withContext(context, () => fn(...args));
    };

    if (isConfigured()) {
      return run();
    } else {
      return ready.then(run);
    }
  }) as T;
}

/**
 * Hono middleware that extracts the GCP trace header and scopes it as
 * LogTape implicit context for the lifetime of the request.
 *
 * Automatically initialises the library on first use if `configureGcpLogging()`
 * was not called explicitly.
 *
 * Every `logger.*` or `console.*` call — in your code **or** in third-party
 * dependencies — will automatically include the trace fields while inside this
 * context.
 *
 * @example
 * ```typescript
 * import { Hono } from 'hono';
 * import { honoLoggerMiddleware, logger } from 'nodejs-gcp-log-correlation';
 *
 * const app = new Hono();
 * app.use(honoLoggerMiddleware());
 *
 * app.get('/', (c) => {
 *   logger.info('Request processed');
 *   return c.json({ status: 'ok' });
 * });
 * ```
 */
export function honoLoggerMiddleware(): (
  c: { req: { header(name: string): string | undefined } },
  next: () => Promise<void>
) => Promise<void> {
  const ready = ensureConfigured();

  return async (c, next) => {
    if (!isConfigured()) {
      await ready;
    }

    const traceHeader = c.req.header('x-cloud-trace-context');
    if (!traceHeader) {
      await next();
      return;
    }

    const context = parseTraceHeader(traceHeader);
    await withContext(context, async () => {
      await next();
    });
  };
}

// ── Helpers ───────────────────────────────────────────────────────────

function parseTraceHeader(header: string): Record<string, string> {
  const [traceId, spanPart] = header.split('/');
  const spanId = spanPart?.split(';')[0];
  const projectId = getProjectId();

  const context: Record<string, string> = {};

  if (traceId) {
    context[TRACE_KEY] = projectId ? `projects/${projectId}/traces/${traceId}` : traceId;
  }
  if (spanId) {
    context[SPAN_KEY] = spanId;
  }

  return context;
}
