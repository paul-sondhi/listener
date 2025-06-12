/**
 * Supabase Client Mock (Vitest Alias)
 * ---------------------------------------------------------------
 * This module provides a chain-friendly mock implementation of the
 * `@supabase/supabase-js` client so that unit and integration tests can run
 * without a live Postgres backend.  The file is aliased in `vitest.config.ts`
 * so *all* imports of `@supabase/supabase-js` inside the test-runner resolve
 * here instead of the real SDK.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// In-Memory Table Storage
// ---------------------------------------------------------------------------
const db: Record<string, any[]> = {};

// ---------------------------------------------------------------------------
// Query Builder Factory
// ---------------------------------------------------------------------------
function buildQuery(table?: string) {
  const state: any = {
    table,
    pendingInsert: undefined as any[] | undefined,
    pendingUpsert: undefined as any[] | undefined,
    pendingUpdate: null as Record<string, any> | null,
    whereEq: [] as [string, any][],
    whereIn: [] as [string, any[]][],
    selectColumns: undefined as string | string[] | undefined,
    selectOpts: undefined as any,
    whereNotNull: [] as string[]
  };

  const qb: any = {};

  // ------------------------------
  // Filter Helpers
  // ------------------------------
  const applyFilters = (rows: any[]): any[] => {
    let out = rows;
    // eq filters
    state.whereEq.forEach(([col, val]: [string, any]) => {
      out = out.filter(r => r[col] === val);
    });
    // in filters
    state.whereIn.forEach(([col, list]: [string, any[]]) => {
      out = out.filter(r => list.includes(r[col]));
    });
    // not-null filters
    state.whereNotNull.forEach((col: string) => {
      out = out.filter(r => r[col] !== null && r[col] !== undefined);
    });
    return out;
  };

  // ------------------------------
  // Mutation Methods
  // ------------------------------
  qb.insert = vi.fn((payload: any[]) => {
    state.pendingInsert = payload;
    if (!db[state.table!]) db[state.table!] = [];
    db[state.table!].push(...payload);
    return qb;
  });

  qb.upsert = vi.fn((payload: any[], _options?: any) => {
    if (!db[state.table!]) db[state.table!] = [];
    payload.forEach(row => {
      const idx = db[state.table!].findIndex(r => r.id === row.id);
      if (idx !== -1) db[state.table!][idx] = { ...db[state.table!][idx], ...row };
      else db[state.table!].push(row);
    });
    state.pendingUpsert = payload;
    return qb;
  });

  qb.update = vi.fn((fields: Record<string, any>) => {
    state.pendingUpdate = fields;
    return qb;
  });

  qb.delete = vi.fn(() => {
    state.pendingUpdate = { __delete: true };
    return qb;
  });

  // ------------------------------
  // Filter Builders
  // ------------------------------
  qb.eq = vi.fn((col: string, val: any) => {
    state.whereEq.push([col, val]);
    return qb;
  });

  qb.in = vi.fn((col: string, values: any[]) => {
    state.whereIn.push([col, values]);
    return qb;
  });

  qb.not = vi.fn((col: string, op: string, val: any) => {
    if (op === 'is' && val === null) state.whereNotNull.push(col);
    return qb;
  });

  qb.is = qb.eq; // alias – sufficient for tests

  qb.limit = vi.fn((_count: number) => qb);

  qb.order = vi.fn((_column: string, _opts?: any) => qb);

  // ------------------------------
  // Select & Count
  // ------------------------------
  qb.select = vi.fn((cols?: string | string[], opts?: any) => {
    state.selectColumns = cols;
    state.selectOpts = opts;
    return qb;
  });

  qb.single = vi.fn(async () => {
    const rows = applyFilters(db[state.table!] ?? []);
    return {
      data: rows[0] ?? null,
      error: null,
      status: rows.length > 0 ? 200 : 404
    };
  });

  qb.count = vi.fn().mockResolvedValue({ count: 0, error: null });

  // ------------------------------
  // Promise-like "then" for `await`
  // ------------------------------
  qb.then = vi.fn().mockImplementation(async (resolve: any) => {
    const rows = db[state.table!] ?? [];

    // Handle immediate responses for mutations --------------------------------
    if (state.pendingInsert) {
      return resolve({ data: state.pendingInsert, error: null, status: 201 });
    }
    if (state.pendingUpsert) {
      return resolve({ data: state.pendingUpsert, error: null, status: 201 });
    }

    // Handle updates / deletes ---------------------------------------------
    if (state.pendingUpdate) {
      const targets = applyFilters(rows);

      // Deletion flag used by qb.delete()
      if (state.pendingUpdate.__delete) {
        db[state.table!] = rows.filter(r => !targets.includes(r));
        return resolve({ data: targets, error: null, status: 200 });
      }

      // Standard update merges provided fields into each target row
      targets.forEach(r => Object.assign(r, state.pendingUpdate));
      return resolve({ data: targets, error: null, status: 200 });
    }

    // Apply filters for read paths ------------------------------------------------
    const resultRows = applyFilters(rows);

    // Handle select with head:true (no data, count only)
    if (state.selectOpts?.head === true && state.selectOpts?.count === 'exact') {
      return resolve({ count: resultRows.length, error: null, status: 200 });
    }

    // Handle select count options (e.g., select('*', { count: 'exact' }))
    if (state.selectOpts?.count === 'exact') {
      return resolve({ data: resultRows, count: resultRows.length, error: null, status: 200 });
    }

    // Handle shorthand select('count') where caller expects [{ count: N }]
    if (typeof state.selectColumns === 'string' && state.selectColumns.trim() === 'count') {
      return resolve({ data: [{ count: resultRows.length }], error: null, status: 200 });
    }

    return resolve({ data: resultRows, error: null, status: 200 });
  });

  // ------------------------------
  // Chaining entry (from)
  // ------------------------------
  qb.from = (tbl: string) => buildQuery(tbl);

  return qb;
}

// ---------------------------------------------------------------------------
// Client Builder
// ---------------------------------------------------------------------------
function buildClient() {
  return {
    from: (tbl: string) => buildQuery(tbl),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null })
    }
  };
}

export const createClient = vi.fn((_url?: string, _key?: string, _opts?: any) => buildClient());

// Minimal type shim so TypeScript tests can reference `SupabaseClient`
export class SupabaseClient {}

export default {
  createClient,
  SupabaseClient
}; 