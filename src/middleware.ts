import { withContext } from '@logtape/logtape';
import { TRACE_KEY, SPAN_KEY, getProjectId } from './context-manager';
import { ensureConfigured } from './logger';

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
 */
export function loggerMiddleware(): (
  req: { header(name: string): string | undefined },
  res: unknown,
  next: (err?: unknown) => void
) => void {
  const ready = ensureConfigured();

  return (req, _res, next): void => {
    ready
      .then(() => {
        const traceHeader = req.header('x-cloud-trace-context');
        if (!traceHeader) {
          next();
          return;
        }

        const context = parseTraceHeader(traceHeader);
        withContext(context, () => {
          next();
        });
      })
      .catch(next);
  };
}

/**
 * Wrap a Cloud Run function handler so that the GCP trace context is
 * automatically propagated through the entire function execution.
 *
 * Automatically initialises the library on first use if `configureGcpLogging()`
 * was not called explicitly.
 */
export function wrapCloudRunFunction<T extends (...args: any[]) => any>(fn: T): T {
  const ready = ensureConfigured();

  return ((...args: any[]): any => {
    const req = args[0] as Record<string, any>;
    const traceHeader: string | undefined =
      req.header?.('x-cloud-trace-context') ?? req.headers?.['x-cloud-trace-context'];

    if (!traceHeader) {
      return ready.then(() => fn(...args));
    }

    const headerValue = Array.isArray(traceHeader) ? traceHeader[0] : traceHeader;
    const context = parseTraceHeader(headerValue);
    return ready.then(() => withContext(context, () => fn(...args)));
  }) as T;
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
