import { Request, Response } from 'express';

export interface HttpRequest {
  (req: Request, res: Response): any;
}

export interface LogCorrelationConfig {
  projectId?: string;
  environment?: string;
  logLevel?: string;
}

export interface TraceContext {
  trace?: string;
}

export interface WrappedLogger {
  info: (message: string, meta?: Record<string, any>) => void;
  warn: (message: string, meta?: Record<string, any>) => void;
  error: (message: string, meta?: Record<string, any>) => void;
  debug: (message: string, meta?: Record<string, any>) => void;
}
