'use strict';

import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContextStore {
  requestId: string;
  traceId: string;
  startedAt: number;
  method?: string;
  url?: string;
  userId?: string | null;
  companyId?: string | null;
  role?: string | null;
}

export const contextStorage = new AsyncLocalStorage<RequestContextStore>();

export function getRequestContext(): RequestContextStore | undefined {
  return contextStorage.getStore();
}

export function getRequestId(): string | undefined {
  return contextStorage.getStore()?.requestId;
}

export function setRequestUserContext(input: {
  userId?: string | null;
  companyId?: string | null;
  role?: string | null;
}): void {
  const store = contextStorage.getStore();

  if (!store) return;

  if (input.userId !== undefined) store.userId = input.userId;
  if (input.companyId !== undefined) store.companyId = input.companyId;
  if (input.role !== undefined) store.role = input.role;
}
