/**
 * Advanced utility types and type guards for enhanced type safety
 * Includes generic helpers, validation utilities, and common patterns
 */
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type Required<T, K extends keyof T> = T & {
    [P in K]-?: T[P];
};
export type NonNullable<T> = T extends null | undefined ? never : T;
export type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
export type DeepRequired<T> = {
    [P in keyof T]-?: T[P] extends object ? DeepRequired<T[P]> : T[P];
};
export type WithTimestamps<T> = T & {
    created_at: string;
    updated_at: string;
};
export type WithId<T, IdType = string> = T & {
    id: IdType;
};
export type PaginationParams = {
    page?: number;
    limit?: number;
    offset?: number;
    cursor?: string;
};
export type SortParams<T = unknown> = {
    sort_by?: keyof T;
    sort_order?: 'asc' | 'desc';
};
export type FilterParams<T = unknown> = {
    [K in keyof T]?: T[K] | T[K][] | {
        eq?: T[K];
        neq?: T[K];
        gt?: T[K];
        gte?: T[K];
        lt?: T[K];
        lte?: T[K];
        in?: T[K][];
        like?: string;
        ilike?: string;
    };
};
export type Result<T, E = Error> = {
    success: true;
    data: T;
    error?: never;
} | {
    success: false;
    data?: never;
    error: E;
};
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;
export type ResultHandler<T, R> = {
    onSuccess: (data: T) => R;
    onError: (error: Error) => R;
};
export type ValidationRule<T> = {
    field: keyof T;
    validator: (value: T[keyof T]) => boolean | string;
    message?: string;
    required?: boolean;
};
export type ValidationResult<T> = {
    isValid: boolean;
    errors: Record<keyof T, string[]>;
    data?: T;
};
export type ValidatedData<T> = T & {
    __validated: true;
};
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
export type HttpHeaders = Record<string, string>;
export type RequestConfig = {
    method?: string;
    headers?: HttpHeaders;
    body?: unknown;
    timeout?: number;
    retries?: number;
    cache?: boolean;
};
export type ResponseMetadata = {
    status: number;
    statusText: string;
    headers: HttpHeaders;
    duration: number;
    cached?: boolean;
};
export type DatabaseOperation = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'UPSERT';
export type QueryFilter<T> = {
    [K in keyof T]?: T[K] | {
        $eq?: T[K];
        $ne?: T[K];
        $gt?: T[K];
        $gte?: T[K];
        $lt?: T[K];
        $lte?: T[K];
        $in?: T[K][];
        $nin?: T[K][];
        $like?: string;
        $ilike?: string;
        $null?: boolean;
    };
};
export type QueryOptions<T> = {
    select?: (keyof T)[];
    where?: QueryFilter<T>;
    order?: {
        [K in keyof T]?: 'asc' | 'desc';
    };
    limit?: number;
    offset?: number;
    include?: string[];
};
export declare function isString(value: unknown): value is string;
export declare function isNumber(value: unknown): value is number;
export declare function isBoolean(value: unknown): value is boolean;
export declare function isObject(value: unknown): value is Record<string, unknown>;
export declare function isArray<T>(value: unknown): value is T[];
export declare function isNull(value: unknown): value is null;
export declare function isUndefined(value: unknown): value is undefined;
export declare function isNullOrUndefined(value: unknown): value is null | undefined;
export declare function isDefined<T>(value: T | null | undefined): value is T;
export declare function isNonEmptyString(value: unknown): value is string;
export declare function isNonEmptyArray<T>(value: unknown): value is T[];
export declare function isValidEmail(value: unknown): value is string;
export declare function isValidUrl(value: unknown): value is string;
export declare function isValidUUID(value: unknown): value is string;
export declare function isDate(value: unknown): value is Date;
export declare function isValidISO8601(value: unknown): value is string;
export declare function isApiSuccess<T>(response: unknown): response is {
    success: true;
    data: T;
};
export declare function isApiError(response: unknown): response is {
    success: false;
    error: Error;
};
export declare function isValidationError(error: unknown): error is {
    field: string;
    message: string;
}[];
export declare function hasId<T>(obj: T): obj is T & {
    id: string;
};
export declare function hasTimestamps<T>(obj: T): obj is T & {
    created_at: string;
    updated_at: string;
};
export declare function assertNever(value: never): never;
export declare function exhaustiveCheck<T extends string | number | symbol>(value: T, handlers: Record<T, () => unknown>): unknown;
export type EnvironmentVariables = {
    NODE_ENV: 'development' | 'production' | 'test';
    PORT?: string;
    SUPABASE_URL: string;
    SUPABASE_ANON_KEY: string;
    SUPABASE_SERVICE_ROLE_KEY?: string;
    DEEPGRAM_API_KEY?: string;
    DATABASE_URL?: string;
};
export declare function getEnvVar(key: keyof EnvironmentVariables): string | undefined;
export declare function getRequiredEnvVar(key: keyof EnvironmentVariables): string;
export type JSONPrimitive = string | number | boolean | null;
export type JSONObject = {
    [key: string]: JSONValue;
};
export type JSONArray = JSONValue[];
export type JSONValue = JSONPrimitive | JSONObject | JSONArray;
export declare function isJSONValue(value: unknown): value is JSONValue;
export declare function safeJSONParse<T = JSONValue>(str: string): Result<T, SyntaxError>;
export declare function safeJSONStringify(value: unknown): Result<string, TypeError>;
//# sourceMappingURL=utilities.d.ts.map