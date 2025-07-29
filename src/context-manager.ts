import { AsyncLocalStorage } from 'async_hooks';
import type { TraceContext } from './types';

const asyncLocalStorage = new AsyncLocalStorage<TraceContext>();

export const runWithContext = (
  context: TraceContext,
  callback: () => void,
): void => {
  asyncLocalStorage.run(context, callback);
};

export const getContext = (): TraceContext => {
  return asyncLocalStorage.getStore() || {};
};

export { asyncLocalStorage };
