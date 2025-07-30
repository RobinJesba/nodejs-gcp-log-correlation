import type { Request, Response, NextFunction } from 'express';
import { runWithContext } from './context-manager';
import type { HttpRequest } from './types';

export function loggerMiddleware() {
  return (req: Request, _: Response, next: NextFunction): void => {
    const traceId = req.header('x-cloud-trace-context')?.split('/')[0];
    const context = traceId ? { trace: traceId } : {};
    runWithContext(context, () => {
      next();
    });
  };
}

export function wrapCloudFunction(fn: HttpRequest): HttpRequest {
  return (req: Request, res: Response): any => {
    const traceId = req.header('x-cloud-trace-context')?.split('/')[0];
    const context = traceId ? { trace: traceId } : {};
    runWithContext(context, fn(req, res));
  };
}
