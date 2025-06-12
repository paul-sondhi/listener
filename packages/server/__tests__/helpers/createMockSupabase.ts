// Universal Supabase client mock for Vitest / Jest
// Provides a fluent query-builder that works with any chain of calls.
// Usage (inside a test):
//   const supabaseMock = createMockSupabase();
//   supabaseMock.queueResolved({ data: [], error: null });
//   __setSupabaseAdminForTesting(supabaseMock.client);
//
// Any awaited call on a chain will pop the next queued entry.
// If the queue is empty the default { data: null, error: null } is returned.
// You can also queue rejections via queueRejected(new Error('msg')).

import { vi } from 'vitest';

export interface QueuedResolve {
  type: 'resolve';
  value: any;
}
export interface QueuedReject {
  type: 'reject';
  error: any;
}

export function createMockSupabase() {
  const queue: Array<QueuedResolve | QueuedReject> = [];

  // The proxy that represents any query builder stage.
  const chainProxy: any = new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop === 'then') {
          // Make Awaitable
          return (resolve: (v: any) => any, reject: (e: any) => any) => {
            if (queue.length === 0) {
              return resolve({ data: null, error: null });
            }
            const item = queue.shift()!;
            if (item.type === 'resolve') {
              return resolve(item.value);
            } else {
              return reject(item.error);
            }
          };
        }
        // Expose helper utilities
        if (prop === 'queueResolved')
          return (value: any) => queue.push({ type: 'resolve', value });
        if (prop === 'queueRejected')
          return (error: any) => queue.push({ type: 'reject', error });
        // Return a no-op vi.fn for spying convenience but still chainable
        const fn = vi.fn(() => chainProxy);
        (chainProxy as any)[prop] = fn;
        return fn;
      },
    }
  );

  // Supabase client stub with auth and from()
  const client = {
    from: vi.fn(() => chainProxy),
    auth: {
      getUser: vi.fn(() => ({ data: { user: { id: 'test-user' } }, error: null })),
    },
  } as any;

  return {
    client,
    queueResolved: (v: any) => chainProxy.queueResolved(v),
    queueRejected: (e: any) => chainProxy.queueRejected(e),
  };
} 