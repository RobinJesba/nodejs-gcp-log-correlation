// ── Logger ───────────────────────────────────────────────────────────
export { logger } from './logger';

// ── Configuration (optional) ─────────────────────────────────────────
export { configureGcpLogging } from './logger';

// ── Middleware ────────────────────────────────────────────────────────
export { loggerMiddleware, wrapCloudRunFunction } from './middleware';

// ── Context helpers & constants ──────────────────────────────────────
export { getTraceContext, TRACE_KEY } from './context-manager';
export { withContext } from '@logtape/logtape';

// ── Types ────────────────────────────────────────────────────────────
export type { GcpLoggingConfig } from './types';
