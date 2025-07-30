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
  transcripts: [],
  episode_transcript_notes: [],
  newsletter_editions: [],

  // Information schema tables for debugging
  'information_schema.tables': [
    { table_name: 'users' },
    { table_name: 'podcast_shows' },
    { table_name: 'user_podcast_subscriptions' },
    { table_name: 'podcast_episodes' },
    { table_name: 'transcripts' },
    { table_name: 'episode_transcript_notes' },
    { table_name: 'newsletter_editions' }
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
    { table_name: 'podcast_episodes', column_name: 'updated_at', data_type: 'timestamp with time zone', is_nullable: 'YES' },
    
    // transcripts table columns
    { table_name: 'transcripts', column_name: 'id', data_type: 'uuid', is_nullable: 'NO' },
    { table_name: 'transcripts', column_name: 'episode_id', data_type: 'uuid', is_nullable: 'NO' },
    { table_name: 'transcripts', column_name: 'storage_path', data_type: 'text', is_nullable: 'YES' },
    { table_name: 'transcripts', column_name: 'status', data_type: 'text', is_nullable: 'NO' },
    { table_name: 'transcripts', column_name: 'word_count', data_type: 'integer', is_nullable: 'YES' },
    { table_name: 'transcripts', column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'YES' },
    { table_name: 'transcripts', column_name: 'updated_at', data_type: 'timestamp with time zone', is_nullable: 'YES' },
    { table_name: 'transcripts', column_name: 'deleted_at', data_type: 'timestamp with time zone', is_nullable: 'YES' },
    // episode_transcript_notes table columns
    { table_name: 'episode_transcript_notes', column_name: 'id', data_type: 'uuid', is_nullable: 'NO' },
    { table_name: 'episode_transcript_notes', column_name: 'episode_id', data_type: 'uuid', is_nullable: 'NO' },
    { table_name: 'episode_transcript_notes', column_name: 'note', data_type: 'text', is_nullable: 'YES' },
    { table_name: 'episode_transcript_notes', column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'YES' },
    { table_name: 'episode_transcript_notes', column_name: 'updated_at', data_type: 'timestamp with time zone', is_nullable: 'YES' },
    
    // newsletter_editions table columns
    { table_name: 'newsletter_editions', column_name: 'id', data_type: 'uuid', is_nullable: 'NO' },
    { table_name: 'newsletter_editions', column_name: 'user_id', data_type: 'uuid', is_nullable: 'NO' },
    { table_name: 'newsletter_editions', column_name: 'edition_date', data_type: 'date', is_nullable: 'NO' },
    { table_name: 'newsletter_editions', column_name: 'status', data_type: 'text', is_nullable: 'NO' },
    { table_name: 'newsletter_editions', column_name: 'user_email', data_type: 'text', is_nullable: 'NO' },
    { table_name: 'newsletter_editions', column_name: 'content', data_type: 'text', is_nullable: 'YES' },
    { table_name: 'newsletter_editions', column_name: 'model', data_type: 'text', is_nullable: 'YES' },
    { table_name: 'newsletter_editions', column_name: 'error_message', data_type: 'text', is_nullable: 'YES' },
    { table_name: 'newsletter_editions', column_name: 'subject_line', data_type: 'text', is_nullable: 'YES' },
    { table_name: 'newsletter_editions', column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'YES' },
    { table_name: 'newsletter_editions', column_name: 'updated_at', data_type: 'timestamp with time zone', is_nullable: 'YES' },
    { table_name: 'newsletter_editions', column_name: 'deleted_at', data_type: 'timestamp with time zone', is_nullable: 'YES' },
    { table_name: 'newsletter_editions', column_name: 'sent', data_type: 'boolean', is_nullable: 'NO' }
  ]
};

// Helper to reset the in-memory DB between tests
export function resetDb() {
  for (const key of Object.keys(db)) {
    if (Array.isArray(db[key])) {
      db[key].length = 0;
    }
  }
  // Re-initialize static tables
  db.pg_proc.push({
    proname: 'begin_token_refresh_transaction',
    proowner: 16384,
    pronamespace: 2200,
    procost: 100,
    prorows: 1000
  });
  db['information_schema.tables'].push(
    { table_name: 'users' },
    { table_name: 'podcast_shows' },
    { table_name: 'user_podcast_subscriptions' },
    { table_name: 'podcast_episodes' },
    { table_name: 'transcripts' },
    { table_name: 'episode_transcript_notes' },
    { table_name: 'newsletter_editions' }
  );
}

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
    whereNotNull: [] as string[],
    whereGte: [] as [string, any][],
    whereLte: [] as [string, any][],
    whereNot: [] as [string, string, any][]
  };

  const qb: any = {};

  // ------------------------------
  // Filter Helpers
  // ------------------------------
  const applyFilters = (rows: any[]): any[] => {
    let out = rows;
    
    // Handle joins - Complex join logic for multiple table scenarios
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
    
    // Handle podcast_episodes with podcast_shows!inner join used by TranscriptWorker
    if (state.table === 'podcast_episodes' && state.selectColumns && 
        typeof state.selectColumns === 'string' && 
        state.selectColumns.includes('podcast_shows!inner')) {
      
      // For podcast_episodes with inner join on podcast_shows,
      // only return episodes that have associated shows with required fields
      const shows = db['podcast_shows'] || [];
      const validShows = shows.filter(show => 
        show.rss_url && show.rss_url.trim() !== '' // RSS URL must exist and not be empty
      );
      const validShowIds = new Set(validShows.map(show => show.id));
      
      out = out.filter(episode => validShowIds.has(episode.show_id));
      
      // If we're selecting show data, we need to attach it
      if (state.selectColumns.includes('podcast_shows!inner')) {
        out = out.map(episode => {
          const show = validShows.find(show => show.id === episode.show_id);
          return {
            ...episode,
            podcast_shows: show ? [show] : []
          };
        });
      }
    }
    
    // Apply all filters to the base rows first
    out = out.filter(r => {
      // eq filters
      for (const [col, val] of state.whereEq) {
        // Handle joined table filters like 'user_podcast_subscriptions.status'
        if (col.includes('.')) {
          const [tableName, _columnName] = col.split('.');
          if (tableName === 'user_podcast_subscriptions' && state.table === 'podcast_shows') {
            // Already handled above in the join logic
            continue;
          }
        } else {
          // Handle negated conditions (from .not('col', 'eq', 'value'))
          if (typeof val === 'string' && val.startsWith('NOT_')) {
            const actualVal = val.substring(4); // Remove 'NOT_' prefix
            if (r[col] === actualVal) return false;
          } else if (val === null) {
            // .is('col', null) should match both null and undefined
            if (r[col] !== null && r[col] !== undefined) return false;
          } else {
            if (r[col] !== val) return false;
          }
        }
      }
      
      // in filters
      for (const [col, list] of state.whereIn) {
        // Handle joined table column references (e.g., 'podcast_episodes.show_id')
        if (col.includes('.')) {
          const [tableName, columnName] = col.split('.');
          
          // Special handling for episode_transcript_notes with podcast_episodes.show_id filter
          if (state.table === 'episode_transcript_notes' && tableName === 'podcast_episodes' && columnName === 'show_id') {
            // Find the matching episode to get its show_id
            const matchingEpisode = db['podcast_episodes']?.find(e => e.id === r.episode_id);
            if (!matchingEpisode || !list.includes(matchingEpisode.show_id)) {
              return false;
            }
          } else {
            // For other joined table references, skip for now (can be added as needed)
            console.log('DEBUG: Skipping joined table whereIn filter', { column: col, table: state.table });
            continue;
          }
        } else {
          // Regular column filter
          if (!list.includes(r[col])) return false;
        }
      }
      
      // not-null filters
      for (const col of state.whereNotNull) {
        if (r[col] === null || r[col] === undefined) return false;
      }
      
      // Handle .gte() filters for timestamps
      for (const [col, val] of state.whereGte) {
        if (col === 'created_at' || col === 'updated_at' || col === 'pub_date') {
          // Handle timestamp comparisons
          const rowDate = new Date(r[col]);
          const filterDate = new Date(val);
          if (rowDate < filterDate) return false;
        } else {
          // Handle numeric comparisons
          if (r[col] < val) return false;
        }
      }
      
      // lte filters (less than or equal)
      for (const [col, val] of state.whereLte) {
        if (r[col] && val) {
          // Handle date comparisons
          const rowDate = new Date(r[col]);
          const filterDate = new Date(val);
          if (rowDate > filterDate) return false;
        } else {
          return false;
        }
      }
      
      return true;
    });
    
    // Debug: print storage_path values before .not('storage_path', 'eq', '') filter
    // Removed for cleaner test output
    
    // Handle complex .not() conditions used by TranscriptWorker (apply after other filters)
    for (const [col, op, val] of state.whereNot) {
      if (op === 'is' && val === null) {
        out = out.filter(r => r[col] !== null && r[col] !== undefined);
      } else if (op === 'eq') {
        if (val === '') {
          // Exclude rows where col is empty string, null, or undefined (SQL-like behavior)
          out = out.filter(r => !(r[col] === '' || r[col] === null || r[col] === undefined));
        } else {
          out = out.filter(r => r[col] !== val);
        }
      }
    }
    
    // Debug: print storage_path values after .not('storage_path', 'eq', '') filter
    // Removed for cleaner test output
    
    // PATCH: .is('col', null) should match both null and undefined (for deleted_at filtering)
    for (const [col, val] of state.whereEq) {
      if (val === null) {
        out = out.filter(r => r[col] === null || r[col] === undefined);
      }
    }
    
    // --- PATCH: Only after filtering, attach joins for transcripts -> podcast_episodes!inner -> podcast_shows!inner ---
    if (
      state.table === 'transcripts' &&
      state.selectColumns &&
      typeof state.selectColumns === 'string' &&
      state.selectColumns.includes('podcast_episodes!inner')
    ) {
      out = out.map(transcript => {
        // Find matching episode by episode_id
        const matchingEpisode = db['podcast_episodes']?.find(e => e.id === transcript.episode_id);
        if (!matchingEpisode) return transcript; // No join if not found
        // Find matching show by show_id
        const matchingShow = db['podcast_shows']?.find(s => s.id === matchingEpisode.show_id);
        // Attach show to episode
        const episodeWithShow = matchingShow ? { ...matchingEpisode, podcast_shows: [matchingShow] } : matchingEpisode;
        // Attach episode to transcript
        return { ...transcript, podcast_episodes: [episodeWithShow] };
      });
    }
    
    // --- PATCH: Attach joins for episode_transcript_notes -> podcast_episodes!inner -> podcast_shows!inner ---
    if (
      state.table === 'episode_transcript_notes' &&
      state.selectColumns &&
      typeof state.selectColumns === 'string' &&
      state.selectColumns.includes('podcast_episodes!inner')
    ) {
      out = out.map(note => {
        // Find matching episode by episode_id
        const matchingEpisode = db['podcast_episodes']?.find(e => e.id === note.episode_id);
        if (!matchingEpisode) return note; // No join if not found
        
        // Find matching show by show_id
        const matchingShow = db['podcast_shows']?.find(s => s.id === matchingEpisode.show_id);
        
        // Attach show to episode
        const episodeWithShow = matchingShow ? { ...matchingEpisode, podcast_shows: [matchingShow] } : matchingEpisode;
        
        // Attach episode to note
        return { ...note, podcast_episodes: [episodeWithShow] };
      });
    }
    
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

  qb.upsert = vi.fn((payload: any | any[], _options?: any) => {
    if (!db[state.table!]) db[state.table!] = [];
    
    // Normalize payload to array (handle both single object and array)
    const normalizedPayload = Array.isArray(payload) ? payload : [payload];
    
    normalizedPayload.forEach(row => {
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
      } else if (state.table === 'newsletter_editions') {
        // Newsletter editions are unique by user_id + edition_date combination
        idx = db[state.table!].findIndex(r => 
          r.user_id === row.user_id && r.edition_date === row.edition_date && !r.deleted_at
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
    state.pendingUpsert = normalizedPayload;
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
    if (op === 'is' && val === null) {
      state.whereNotNull.push(col);
    } else if (op === 'eq') {
      // Handle .not('column', 'eq', value) - exclude rows where column equals value
      // For simplicity in tests, we'll track this as a negated equality condition
      state.whereEq.push([col, `NOT_${val}`]); // Mark as negated
    }
    // Add support for more complex .not() conditions used by TranscriptWorker
    // These get handled in the applyFilters function
    if (!state.whereNot) state.whereNot = [];
    state.whereNot.push([col, op, val]);
    return qb;
  });

  qb.is = qb.eq; // alias – sufficient for tests

  // Add date comparison methods used in TranscriptWorker
  qb.gte = vi.fn((col: string, val: any) => {
    // Store the gte condition for potential filtering
    // For test simplicity, we'll just track it but not apply complex filtering
    if (!state.whereGte) state.whereGte = [];
    state.whereGte.push([col, val]);
    return qb; // Ensure we return the query builder for chaining
  });

  qb.lte = vi.fn((col: string, val: any) => {
    // Store the lte condition for potential filtering  
    // For test simplicity, we'll just track it but not apply complex filtering
    if (!state.whereLte) state.whereLte = [];
    state.whereLte.push([col, val]);
    return qb; // Ensure we return the query builder for chaining
  });

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
    // If this is immediately after an insert, return the last inserted row
    if (state.pendingInsert && db[state.table!].length > 0) {
      const lastInserted = db[state.table!][db[state.table!].length - 1];
      state.pendingInsert = undefined; // Clear after use
      return {
        data: lastInserted,
        error: null,
        status: 201
      };
    }
    
    // If this is immediately after an update, apply the update and return the first matching row
    if (state.pendingUpdate) {
      const rows = db[state.table!] ?? [];
      const targets = applyFilters(rows);
      
      // Apply the update to matching rows
      targets.forEach(r => Object.assign(r, state.pendingUpdate));
      
      // Return the first updated row
      return {
        data: targets[0] ?? null,
        error: null,
        status: targets.length > 0 ? 200 : 404
      };
    }
    
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
  const client = {
    from: (tbl: string) => buildQuery(tbl),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null })
    },
    storage: {
      from: vi.fn((_bucketName: string) => ({
        upload: vi.fn().mockResolvedValue({ error: null }),
        uploadTranscript: vi.fn().mockResolvedValue({ error: null })
      }))
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
  return client;
}

export const createClient = vi.fn((_url?: string, _key?: string, _opts?: any) => buildClient());

// Minimal type shim so TypeScript tests can reference `SupabaseClient`
export class SupabaseClient {}

export default {
  createClient,
  SupabaseClient
}; 