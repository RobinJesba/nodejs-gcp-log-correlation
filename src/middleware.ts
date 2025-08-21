import type { Request, Response, NextFunction } from 'express';
import { runWithContext } from './context-manager';

export function loggerMiddleware() {
  return (req: Request, _: Response, next: NextFunction): void => {
    const traceId = req.header('x-cloud-trace-context')?.split('/')[0];
    const context = traceId ? { trace: traceId } : {};
    runWithContext(context, () => {
      next();
    });
  };
}

export function wrapCloudFunction<T extends (...args: any[]) => any>(fn: T): T {
  return ((...args: any[]): any => {
    const req = args[0];
    const traceId = req.header('x-cloud-trace-context')?.split('/')[0];
    const context = traceId ? { trace: traceId } : {};
    return runWithContext(context, () => fn(...args));
  }) as T;
}
