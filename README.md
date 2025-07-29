# nodejs-gcp-log-correlation

A Node.js package for automatic log correlation in Google Cloud Platform with zero configuration.

## Installation

```bash
npm install nodejs-gcp-log-correlation
```

## Usage

### Express App

```typescript
import express from 'express';
import { logger, loggerMiddleware } from 'nodejs-gcp-log-correlation';

const app = express();
app.use(loggerMiddleware());

app.get('/', (req, res) => {
  logger.info('Request processed'); // Automatically correlated with trace
  res.json({ status: 'ok' });
});
```

### Cloud Functions

```typescript
import { wrapCloudFunction, logger } from 'nodejs-gcp-log-correlation';

export const handler = wrapCloudFunction((req, res) => {
  logger.info('Function executed'); // Automatically correlated with trace
  res.send('Done!');
});
```

## Environment
- `NODE_ENV`
- `GOOGLE_CLOUD_PROJECT`

## License
MIT
