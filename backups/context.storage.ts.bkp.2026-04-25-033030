import { AsyncLocalStorage } from 'async_hooks';

export interface AppContext {
  userId?: string;
  companyId?: string;
  requestId: string;
}

export const contextStorage = new AsyncLocalStorage<AppContext>();
