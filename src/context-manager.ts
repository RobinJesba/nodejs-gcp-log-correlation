import type { AsyncLocalStorage } from 'node:async_hooks';

/** GCP Cloud Logging trace key — used as the context property name */
export const TRACE_KEY = 'logging.googleapis.com/trace';

/** GCP Cloud Logging span ID key */
export const SPAN_KEY = 'logging.googleapis.com/spanId';

// ── Internal state set by configureGcpLogging() ──────────────────────
let projectId = '';
let contextStorage: AsyncLocalStorage<Record<string, unknown>> | undefined;

/** @internal */
export function setProjectId(id: string): void {
  projectId = id;
}

export function getProjectId(): string {
  return projectId;
}

/** @internal – called by configureGcpLogging() so other modules can read the store */
export function setContextStorage(storage: AsyncLocalStorage<Record<string, unknown>>): void {
  contextStorage = storage;
}

/**
 * Read the current GCP trace context from LogTape's implicit context.
 * Returns an empty object when called outside a traced context.
 */
export function getTraceContext(): { trace?: string } {
  if (!contextStorage) return {};
  const store = contextStorage.getStore();
  if (!store) return {};
  return {
    trace: typeof store[TRACE_KEY] === 'string' ? store[TRACE_KEY] : undefined,
  };
}

/**
 * @internal — full context including spanId, used by console-patch.
 */
export function getFullTraceContext(): { trace?: string; spanId?: string } {
  if (!contextStorage) return {};
  const store = contextStorage.getStore();
  if (!store) return {};
  return {
    trace: typeof store[TRACE_KEY] === 'string' ? store[TRACE_KEY] : undefined,
    spanId: typeof store[SPAN_KEY] === 'string' ? store[SPAN_KEY] : undefined,
  };
}

// ── Auto-detect GCP project ID ───────────────────────────────────────

/**
 * Resolve the GCP project ID automatically:
 *   1. Explicit value passed by caller
 *   2. Environment variables (`GOOGLE_CLOUD_PROJECT`, `GCLOUD_PROJECT`, `GCP_PROJECT`)
 *   3. GCP metadata server (works on Cloud Run, GCE, GKE, Cloud Functions)
 *
 * @internal
 */
export async function detectProjectId(explicit?: string): Promise<string> {
  if (explicit) return explicit;

  return process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || '';
}
