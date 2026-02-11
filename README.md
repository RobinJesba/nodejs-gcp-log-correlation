# nodejs-gcp-log-correlation

Automatic GCP Cloud Logging trace correlation for Node.js.

Add the middleware, import `logger`, and **every** log — including `console.log()` calls from third-party dependencies — is automatically correlated with the active request trace in GCP Cloud Logging. Zero configuration required.

## Installation

```bash
npm install nodejs-gcp-log-correlation
```

## Quick start

### Express

```typescript
import express from 'express';
import { loggerMiddleware, logger } from 'nodejs-gcp-log-correlation';

const app = express();
app.use(loggerMiddleware());

app.get('/', (req, res) => {
  logger.info('Request processed'); // ← correlated
  console.log('Also correlated!'); // ← correlated (even from dependencies)
  res.json({ status: 'ok' });
});

app.listen(8080);
```

### Cloud Run Functions

```typescript
import { wrapCloudRunFunction, logger } from 'nodejs-gcp-log-correlation';

export const handler = wrapCloudRunFunction((req, res) => {
  logger.info('Function executed');
  res.send('Done!');
});
```

### Third-party dependencies

Any dependency that calls `console.log`, `console.error`, etc. is automatically correlated — no changes needed on their side.

## How it works

1. `loggerMiddleware()` or `wrapCloudRunFunction()` auto-initialises the library on first use — setting up structured logging, auto-detecting the GCP project ID, and patching global `console` methods.
2. The middleware extracts the `x-cloud-trace-context` header and scopes the trace to the request’s async lifecycle via `AsyncLocalStorage`.
3. Every `logger.*` and `console.*` call within that lifecycle includes the `logging.googleapis.com/trace` field, making logs correlated in Cloud Logging Explorer.

## API

### `logger`

Pre-configured logger instance. Supports `logger.info()`, `logger.debug()`, `logger.warn()`, `logger.error()`, `logger.fatal()`, and `logger.trace()`.

```typescript
import { logger } from 'nodejs-gcp-log-correlation';

// String with structured properties
logger.info('User {userId} logged in', { userId: 'u_123' });

// Tagged template
logger.info`User ${userId} logged in`;

// Properties only
logger.info({ event: 'login', userId: 'u_123' });
```

### `loggerMiddleware()`

Express middleware. Extracts the trace header and scopes it to the request lifecycle. Auto-initialises the library on first use.

### `wrapCloudRunFunction(fn)`

Wraps a Cloud Run function handler with trace context propagation. Auto-initialises the library on first use.

### `configureGcpLogging(options?)` _(optional)_

Call this **only** if you need custom options. The middleware auto-initialises with sensible defaults otherwise. If used, call it **once** at startup **before** the middleware.

| Option         | Type      | Default                           | Description                                             |
| -------------- | --------- | --------------------------------- | ------------------------------------------------------- |
| `projectId`    | `string`  | _auto-detected from env vars_     | GCP project ID                                          |
| `environment`  | `string`  | `process.env.NODE_ENV`            | `"development"` → console transport; else Cloud Logging |
| `logLevel`     | `string`  | `"debug"` (dev) / `"info"` (prod) | Minimum log level                                       |
| `serviceName`  | `string`  | —                                 | Service name in Cloud Logging `serviceContext`          |
| `patchConsole` | `boolean` | `true`                            | Patch `console.*` for dependency log correlation        |

### `getTraceContext()`

Returns `{ trace?: string }` — the current GCP trace value. Useful for propagating trace IDs to external systems (e.g. queue messages).

```typescript
import { getTraceContext } from 'nodejs-gcp-log-correlation';

const { trace } = getTraceContext();
await queue.send({ payload, traceId: trace });
```

### `TRACE_KEY`

The `logging.googleapis.com/trace` constant. Use with `withContext()` for manual trace propagation outside Express / Cloud Run:

```typescript
import { withContext, logger, TRACE_KEY } from 'nodejs-gcp-log-correlation';

worker.on('message', msg => {
  withContext({ [TRACE_KEY]: msg.traceId }, () => {
    logger.info('Processing message'); // ← correlated with original request
  });
});
```

## Environment variables

| Variable               | Purpose                                |
| ---------------------- | -------------------------------------- |
| `GOOGLE_CLOUD_PROJECT` | GCP project ID (primary)               |
| `GCLOUD_PROJECT`       | GCP project ID (fallback)              |
| `GCP_PROJECT`          | GCP project ID (fallback)              |
| `NODE_ENV`             | `"development"` enables console output |

## Migration from v1

| v1                             | v2                                                                  |
| ------------------------------ | ------------------------------------------------------------------- |
| `import { logger } from '...'` | `import { logger } from '...'` (same!)                              |
| Basic logging                  | [Structured logging](https://logtape.org/manual/struct) via LogTape |
| No dependency log correlation  | `console.*` calls from dependencies are automatically correlated    |

## License

MIT
