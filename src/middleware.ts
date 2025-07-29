import type { Request, Response, NextFunction } from 'express';
import { runWithContext } from './context-manager';
import type { ExpressMiddleware, HttpRequest } from './types';
import { initializeLogger } from './logger';

export function loggerMiddleware(): ExpressMiddleware {
    initializeLogger();
  return (req: Request, _: Response, next: NextFunction): void => {
    const traceId = (req.headers['x-cloud-trace-context'] as string)?.split('/')[0];
    const context = traceId ? { trace: traceId } : {};
    runWithContext(context, () => {
      next();
    });
  };
}

export function wrapCloudFunction(
  fn: HttpRequest,
): HttpRequest {
    initializeLogger();
  return (req: Request, res: Response): any => {
    const traceId = (req.headers['x-cloud-trace-context'] as string)?.split('/')[0];
    if (traceId) {
      const context = { trace: traceId };
      return runWithContext(context, () => fn(req, res));
    }
    return fn(req, res);
  };
}