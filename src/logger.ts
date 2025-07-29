import winston from 'winston';
import { LoggingWinston } from '@google-cloud/logging-winston';
import { getContext } from './context-manager';
import type { WrappedLogger, LogCorrelationConfig } from './types';

export let logger: WrappedLogger | Console = console;
let isInitialized = false;

function createLoggerConfig(
  config: Required<LogCorrelationConfig>,
): winston.LoggerOptions {
  const isLocalDevelopment = config.environment === 'development';

  if (isLocalDevelopment) {
    return {
      level: config.logLevel,
      transports: [new winston.transports.Console()],
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          const metaStr =
            Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
          return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
        }),
      ),
    };
  }

  return {
    level: config.logLevel,
    transports: [new LoggingWinston()],
    format: winston.format.json(),
  };
}

function wrapLoggerWithContext(
  logger: winston.Logger,
  config: Required<LogCorrelationConfig>,
): WrappedLogger {
  const logLevels = ['info', 'warn', 'error', 'debug'] as const;
  const wrapped: Partial<WrappedLogger> = {};
  logLevels.forEach((level) => {
    wrapped[level] = (message: string, meta: Record<string, any> = {}) => {
      const context = getContext();
      let logMeta = { ...meta };
      if (context.trace) {
        const formattedTrace = context.trace.startsWith('projects/')
          ? context.trace
          : `projects/${config.projectId}/traces/${context.trace}`;
        logMeta = {
          'logging.googleapis.com/trace': formattedTrace,
          ...logMeta,
        };
      }
      return logger[level](message, logMeta);
    };
  });

  return wrapped as WrappedLogger;
}

export function initializeLogger(): WrappedLogger {
  if (isInitialized && logger !== console) return logger as WrappedLogger;

  const environment = process.env.NODE_ENV || 'development';
  const config = {
    environment,
    projectId: process.env.GOOGLE_CLOUD_PROJECT || '',
    logLevel: environment === 'development' ? 'debug' : 'info',
  };

  if (environment !== 'development' && !config.projectId) {
    console.warn(
      'nodejs-gcp-log-correlation: No GCP Project ID detected. Trace correlation may not work properly.',
    );
  }

  try {
    const loggerConfig = createLoggerConfig(config);
    const winstonLogger = winston.createLogger(loggerConfig);
    logger = wrapLoggerWithContext(winstonLogger, config);
    isInitialized = true;
    return logger;
  } catch (error) {
    console.warn(
      'Failed to initialize Winston logger, falling back to console:',
      error,
    );
    return console as any;
  }
}
