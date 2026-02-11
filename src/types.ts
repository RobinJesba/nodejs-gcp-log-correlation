/** Options for {@link configureGcpLogging}. */
export interface GcpLoggingConfig {
  /**
   * GCP project ID.
   *
   * Auto-detected in this order:
   *   1. This explicit value
   *   2. `GOOGLE_CLOUD_PROJECT` / `GCLOUD_PROJECT` / `GCP_PROJECT` env vars
   */
  projectId?: string;
  /** `"development"` uses console transport; anything else uses GCP Cloud Logging. Falls back to `NODE_ENV`. */
  environment?: string;
  /** Winston / LogTape log level. Defaults to `"debug"` in dev, `"info"` otherwise. */
  logLevel?: string;
  /** Service name reported to Cloud Logging (appears in `serviceContext`). */
  serviceName?: string;
  /**
   * Monkey-patch global `console` methods so that **all** `console.log` /
   * `console.error` / … calls — including from third-party dependencies —
   * are automatically correlated with the active GCP trace.
   *
   * @default true
   */
  patchConsole?: boolean;
}
