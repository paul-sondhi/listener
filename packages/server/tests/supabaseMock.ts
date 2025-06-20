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
const db: Record<string, any[]> = {
  // Mock pg_proc table with database functions
  pg_proc: [
    {
      proname: 'begin_token_refresh_transaction',
      proowner: 16384,
      pronamespace: 2200,
      procost: 100,
      prorows: 1000
    }
    // Add more database functions here as needed
  ],

  // Core tables for integration tests
  users: [],
  podcast_shows: [],
  user_podcast_subscriptions: [],
  podcast_episodes: [],

  // Information schema tables for debugging
  'information_schema.tables': [
    { table_name: 'users' },
    { table_name: 'podcast_shows' },
    { table_name: 'user_podcast_subscriptions' },
    { table_name: 'podcast_episodes' }
  ],
  'information_schema.columns': [
    // users table columns
    { table_name: 'users', column_name: 'id', data_type: 'uuid', is_nullable: 'NO' },
    { table_name: 'users', column_name: 'email', data_type: 'text', is_nullable: 'YES' },
    { table_name: 'users', column_name: 'spotify_tokens_enc', data_type: 'bytea', is_nullable: 'YES' },
    { table_name: 'users', column_name: 'spotify_reauth_required', data_type: 'boolean', is_nullable: 'YES' },
    { table_name: 'users', column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'YES' },
    
    // podcast_shows table columns
    { table_name: 'podcast_shows', column_name: 'id', data_type: 'text', is_nullable: 'NO' },
    { table_name: 'podcast_shows', column_name: 'spotify_url', data_type: 'text', is_nullable: 'NO' },
    { table_name: 'podcast_shows', column_name: 'title', data_type: 'text', is_nullable: 'YES' },
    { table_name: 'podcast_shows', column_name: 'description', data_type: 'text', is_nullable: 'YES' },
    { table_name: 'podcast_shows', column_name: 'image_url', data_type: 'text', is_nullable: 'YES' },
    { table_name: 'podcast_shows', column_name: 'rss_url', data_type: 'text', is_nullable: 'YES' },
    { table_name: 'podcast_shows', column_name: 'etag', data_type: 'text', is_nullable: 'YES' },
    { table_name: 'podcast_shows', column_name: 'last_modified', data_type: 'text', is_nullable: 'YES' },
    { table_name: 'podcast_shows', column_name: 'last_checked_episodes', data_type: 'timestamp with time zone', is_nullable: 'YES' },
    { table_name: 'podcast_shows', column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'YES' },
    { table_name: 'podcast_shows', column_name: 'updated_at', data_type: 'timestamp with time zone', is_nullable: 'YES' },
    
    // user_podcast_subscriptions table columns
    { table_name: 'user_podcast_subscriptions', column_name: 'id', data_type: 'uuid', is_nullable: 'NO' },
    { table_name: 'user_podcast_subscriptions', column_name: 'user_id', data_type: 'uuid', is_nullable: 'NO' },
    { table_name: 'user_podcast_subscriptions', column_name: 'show_id', data_type: 'text', is_nullable: 'NO' },
    { table_name: 'user_podcast_subscriptions', column_name: 'status', data_type: 'text', is_nullable: 'NO' },
    { table_name: 'user_podcast_subscriptions', column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'YES' },
    { table_name: 'user_podcast_subscriptions', column_name: 'updated_at', data_type: 'timestamp with time zone', is_nullable: 'YES' },
    
    // podcast_episodes table columns
    { table_name: 'podcast_episodes', column_name: 'id', data_type: 'uuid', is_nullable: 'NO' },
    { table_name: 'podcast_episodes', column_name: 'show_id', data_type: 'text', is_nullable: 'NO' },
    { table_name: 'podcast_episodes', column_name: 'guid', data_type: 'text', is_nullable: 'NO' },
    { table_name: 'podcast_episodes', column_name: 'episode_url', data_type: 'text', is_nullable: 'NO' },
    { table_name: 'podcast_episodes', column_name: 'title', data_type: 'text', is_nullable: 'YES' },
    { table_name: 'podcast_episodes', column_name: 'description', data_type: 'text', is_nullable: 'YES' },
    { table_name: 'podcast_episodes', column_name: 'pub_date', data_type: 'timestamp with time zone', is_nullable: 'YES' },
    { table_name: 'podcast_episodes', column_name: 'duration_sec', data_type: 'integer', is_nullable: 'YES' },
    { table_name: 'podcast_episodes', column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'YES' },
    { table_name: 'podcast_episodes', column_name: 'updated_at', data_type: 'timestamp with time zone', is_nullable: 'YES' }
  ]
};

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
    
    // Handle joins - if we're querying podcast_shows with user_podcast_subscriptions join
    if (state.table === 'podcast_shows' && state.selectColumns && 
        typeof state.selectColumns === 'string' && 
        state.selectColumns.includes('user_podcast_subscriptions!inner')) {
      
      // For podcast_shows with inner join on user_podcast_subscriptions,
      // only return shows that have active subscriptions
      const subscriptions = db['user_podcast_subscriptions'] || [];
      const activeSubscriptions = subscriptions.filter(sub => sub.status === 'active');
      const showIdsWithActiveSubscriptions = [...new Set(activeSubscriptions.map(sub => sub.show_id))];
      
      out = out.filter(show => showIdsWithActiveSubscriptions.includes(show.id));
    }
    
    // eq filters
    state.whereEq.forEach(([col, val]: [string, any]) => {
      // Handle joined table filters like 'user_podcast_subscriptions.status'
      if (col.includes('.')) {
        const [tableName, _columnName] = col.split('.');
        if (tableName === 'user_podcast_subscriptions' && state.table === 'podcast_shows') {
          // Already handled above in the join logic
          return;
        }
      } else {
        out = out.filter(r => r[col] === val);
      }
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
  qb.insert = vi.fn((payload: any[] | any) => {
    // Normalize payload to array format
    const normalizedPayload = Array.isArray(payload) ? payload : [payload];
    state.pendingInsert = normalizedPayload;
    if (!db[state.table!]) db[state.table!] = [];
    db[state.table!].push(...normalizedPayload);
    return qb;
  });

  qb.upsert = vi.fn((payload: any[], _options?: any) => {
    if (!db[state.table!]) db[state.table!] = [];
    payload.forEach(row => {
      let idx = -1;
      
      // Handle different table types with their unique constraints
      if (state.table === 'podcast_episodes') {
        // Episodes are unique by show_id + guid combination
        idx = db[state.table!].findIndex(r => 
          r.show_id === row.show_id && r.guid === row.guid
        );
      } else if (state.table === 'user_podcast_subscriptions') {
        // Subscriptions are unique by user_id + show_id combination
        idx = db[state.table!].findIndex(r => 
          r.user_id === row.user_id && r.show_id === row.show_id
        );
      } else {
        // Default: use id field for other tables
        idx = db[state.table!].findIndex(r => r.id === row.id);
      }
      
      if (idx !== -1) {
        // Update existing record
        db[state.table!][idx] = { ...db[state.table!][idx], ...row };
      } else {
        // Insert new record, adding auto-generated id if needed
        const newRow = { ...row };
        if (!newRow.id && state.table !== 'podcast_episodes') {
          newRow.id = `${state.table}-${Date.now()}-${Math.random()}`;
        }
        if (state.table === 'podcast_episodes' && !newRow.id) {
          newRow.id = `episode-${Date.now()}-${Math.random()}`;
        }
        db[state.table!].push(newRow);
      }
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
    },
    // Add RPC support for database functions
    rpc: vi.fn((functionName: string, params?: any) => {
      return Promise.resolve((() => {
        // Mock database functions used in tests
        switch (functionName) {
          case 'begin_token_refresh_transaction': {
            // Mock the begin_token_refresh_transaction function
            if (params?.p_user_id === 'invalid-uuid') {
              // Return error for invalid UUID format
              return {
                data: null,
                error: { message: 'invalid input syntax for type uuid: "invalid-uuid"' }
              };
            }
            // Validate UUID format (basic check)
            const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (params?.p_user_id && !uuidPattern.test(params.p_user_id)) {
              return {
                data: null,
                error: { message: 'invalid input syntax for type uuid' }
              };
            }
            // Return success for valid UUID
            return {
              data: [{
                user_id: params?.p_user_id || '123e4567-e89b-12d3-a456-426614174000',
                locked: false
              }],
              error: null
            };
          }
          
          default:
            // Return error for unknown functions
            return {
              data: null,
              error: { message: `function ${functionName} does not exist` }
            };
        }
      })());
    })
  };
}

export const createClient = vi.fn((_url?: string, _key?: string, _opts?: any) => buildClient());

// Minimal type shim so TypeScript tests can reference `SupabaseClient`
export class SupabaseClient {}

export default {
  createClient,
  SupabaseClient
}; 