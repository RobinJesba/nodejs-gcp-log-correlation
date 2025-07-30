import { AsyncLocalStorage } from 'async_hooks';
import type { TraceContext } from './types';

const asyncLocalStorage = new AsyncLocalStorage<TraceContext>();

export const runWithContext = <T>(context: TraceContext, callback: () => T): T => {
  return asyncLocalStorage.run(context, callback);
};

export const getContext = (): TraceContext => {
  return asyncLocalStorage.getStore() || {};
};

export { asyncLocalStorage };
