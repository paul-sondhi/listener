/**
 * Advanced utility types and type guards for enhanced type safety
 * Includes generic helpers, validation utilities, and common patterns
 */

// Generic Utility Types
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>
export type Required<T, K extends keyof T> = T & { [P in K]-?: T[P] }
export type NonNullable<T> = T extends null | undefined ? never : T
export type DeepPartial<T> = { [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P] }
export type DeepRequired<T> = { [P in keyof T]-?: T[P] extends object ? DeepRequired<T[P]> : T[P] }

// API-specific utility types
export type WithTimestamps<T> = T & {
  created_at: string
  updated_at: string
}

export type WithId<T, IdType = string> = T & {
  id: IdType
}

export type PaginationParams = {
  page?: number
  limit?: number
  offset?: number
  cursor?: string
}

export type SortParams<T = unknown> = {
  sort_by?: keyof T
  sort_order?: 'asc' | 'desc'
}

export type FilterParams<T = unknown> = {
  [K in keyof T]?: T[K] | T[K][] | {
    eq?: T[K]
    neq?: T[K]
    gt?: T[K]
    gte?: T[K]
    lt?: T[K]
    lte?: T[K]
    in?: T[K][]
    like?: string
    ilike?: string
  }
}

// Result and Error Types
export type Result<T, E = Error> = 
  | { success: true; data: T; error?: never }
  | { success: false; data?: never; error: E }

export type AsyncResult<T, E = Error> = Promise<Result<T, E>>

export type ResultHandler<T, R> = {
  onSuccess: (data: T) => R
  onError: (error: Error) => R
}

// Validation Types
export type ValidationRule<T> = {
  field: keyof T
  validator: (value: T[keyof T]) => boolean | string
  message?: string
  required?: boolean
}

export type ValidationResult<T> = {
  isValid: boolean
  errors: Record<keyof T, string[]>
  data?: T
}

export type ValidatedData<T> = T & { __validated: true }

// HTTP Types
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

export type HttpHeaders = Record<string, string>

export type RequestConfig = {
  method?: string
  headers?: HttpHeaders
  body?: unknown
  timeout?: number
  retries?: number
  cache?: boolean
}

export type ResponseMetadata = {
  status: number
  statusText: string
  headers: HttpHeaders
  duration: number
  cached?: boolean
}

// Database Types
export type DatabaseOperation = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'UPSERT'

export type QueryFilter<T> = {
  [K in keyof T]?: T[K] | {
    $eq?: T[K]
    $ne?: T[K]
    $gt?: T[K]
    $gte?: T[K]
    $lt?: T[K]
    $lte?: T[K]
    $in?: T[K][]
    $nin?: T[K][]
    $like?: string
    $ilike?: string
    $null?: boolean
  }
}

export type QueryOptions<T> = {
  select?: (keyof T)[]
  where?: QueryFilter<T>
  order?: { [K in keyof T]?: 'asc' | 'desc' }
  limit?: number
  offset?: number
  include?: string[]
}

// Type Guards
export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value)
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function isArray<T>(value: unknown): value is T[] {
  return Array.isArray(value)
}

export function isNull(value: unknown): value is null {
  return value === null
}

export function isUndefined(value: unknown): value is undefined {
  return value === undefined
}

export function isNullOrUndefined(value: unknown): value is null | undefined {
  return value === null || value === undefined
}

export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}

export function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0
}

export function isNonEmptyArray<T>(value: unknown): value is T[] {
  return isArray(value) && value.length > 0
}

export function isValidEmail(value: unknown): value is string {
  if (!isString(value)) return false
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(value)
}

export function isValidUrl(value: unknown): value is string {
  if (!isString(value)) return false
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

export function isValidUUID(value: unknown): value is string {
  if (!isString(value)) return false
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(value)
}

export function isDate(value: unknown): value is Date {
  return value instanceof Date && !isNaN(value.getTime())
}

export function isValidISO8601(value: unknown): value is string {
  if (!isString(value)) return false
  const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?([+-]\d{2}:\d{2}|Z)$/
  return iso8601Regex.test(value)
}

// API Response Type Guards
export function isApiSuccess<T>(response: unknown): response is { success: true; data: T } {
  return isObject(response) && response.success === true && 'data' in response
}

export function isApiError(response: unknown): response is { success: false; error: Error } {
  return isObject(response) && response.success === false && 'error' in response
}

export function isValidationError(error: unknown): error is { field: string; message: string }[] {
  return isArray(error) && error.every(item => 
    isObject(item) && isString(item.field) && isString(item.message)
  )
}

// Database Type Guards
export function hasId<T>(obj: T): obj is T & { id: string } {
  return isObject(obj) && 'id' in obj && isString(obj.id)
}

export function hasTimestamps<T>(obj: T): obj is T & { created_at: string; updated_at: string } {
  return isObject(obj) && 
    'created_at' in obj && isString(obj.created_at) &&
    'updated_at' in obj && isString(obj.updated_at)
}

// Utility Functions
export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${value}`)
}

export function exhaustiveCheck<T extends string | number | symbol>(
  value: T,
  handlers: Record<T, () => unknown>
): unknown {
  const handler = handlers[value]
  if (!handler) {
    throw new Error(`No handler found for value: ${String(value)}`)
  }
  return handler()
}

// Type-safe environment variable helpers
export type EnvironmentVariables = {
  NODE_ENV: 'development' | 'production' | 'test'
  PORT?: string
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  DEEPGRAM_API_KEY?: string
  DATABASE_URL?: string
}

export function getEnvVar(key: keyof EnvironmentVariables): string | undefined {
  return process.env[key]
}

export function getRequiredEnvVar(key: keyof EnvironmentVariables): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Required environment variable ${key} is not set`)
  }
  return value
}

// JSON Type Safety
export type JSONPrimitive = string | number | boolean | null
export type JSONObject = { [key: string]: JSONValue }
export type JSONArray = JSONValue[]
export type JSONValue = JSONPrimitive | JSONObject | JSONArray

export function isJSONValue(value: unknown): value is JSONValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true
  }
  
  if (Array.isArray(value)) {
    return value.every(isJSONValue)
  }
  
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).every(isJSONValue)
  }
  
  return false
}

export function safeJSONParse<T = JSONValue>(str: string): Result<T, SyntaxError> {
  try {
    const parsed = JSON.parse(str)
    return { success: true, data: parsed }
  } catch (error) {
    return { success: false, error: error as SyntaxError }
  }
}

export function safeJSONStringify(value: unknown): Result<string, TypeError> {
  try {
    const stringified = JSON.stringify(value)
    return { success: true, data: stringified }
  } catch (error) {
    return { success: false, error: error as TypeError }
  }
} 