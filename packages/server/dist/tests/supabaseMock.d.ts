/**
 * Supabase Client Mock (Vitest Alias)
 * ---------------------------------------------------------------
 * This module provides a chain-friendly mock implementation of the
 * `@supabase/supabase-js` client so that unit and integration tests can run
 * without a live Postgres backend.  The file is aliased in `vitest.config.ts`
 * so *all* imports of `@supabase/supabase-js` inside the test-runner resolve
 * here instead of the real SDK.
 */
export declare const createClient: import("vitest").Mock<(_url?: string, _key?: string, _opts?: any) => {
    from: (tbl: string) => any;
    auth: {
        getUser: import("vitest").Mock<(...args: any[]) => any>;
    };
}>;
export declare class SupabaseClient {
}
declare const _default: {
    createClient: import("vitest").Mock<(_url?: string, _key?: string, _opts?: any) => {
        from: (tbl: string) => any;
        auth: {
            getUser: import("vitest").Mock<(...args: any[]) => any>;
        };
    }>;
    SupabaseClient: typeof SupabaseClient;
};
export default _default;
//# sourceMappingURL=supabaseMock.d.ts.map