// Export all shared type definitions with explicit re-exports to resolve conflicts

// API types (primary source for HttpMethod)
export * from './api.js';

// Authentication types
export * from './auth.js';

// Podcast types
export * from './podcast.js';

// Spotify types
export * from './spotify.js';

// Supabase types
export * from './supabase.js';

// Transcript types
export * from './transcript.js';

// Episode transcript notes types
export * from './episode-transcript-notes.js';

// Transcript Result types (shared across all transcript providers)
export * from './TranscriptResult.js';

// Common types (primary source for PaginationParams, SortParams)
export * from './common.js';

// External API types
export * from './external-apis.js';

// Utility types (re-export non-conflicting types only)
export type {
  // Generic utility types
  Optional,
  Required,
  NonNullable,
  DeepPartial,
  DeepRequired,
  WithTimestamps,
  WithId,
  FilterParams,
  
  // Result types
  Result,
  AsyncResult,
  ResultHandler,
  
  // Validation types
  ValidationRule,
  ValidationResult,
  ValidatedData,
  
  // HTTP types (non-conflicting)
  HttpHeaders,
  RequestConfig,
  ResponseMetadata,
  
  // Database types
  DatabaseOperation,
  QueryFilter,
  QueryOptions,
  
  // Environment types
  EnvironmentVariables,
  
  // JSON types
  JSONPrimitive,
  JSONObject,
  JSONArray,
  JSONValue
} from './utilities.js';

// Export utility functions
export {
  // Type guards
  isString,
  isNumber,
  isBoolean,
  isObject,
  isArray,
  isNull,
  isUndefined,
  isNullOrUndefined,
  isDefined,
  isNonEmptyString,
  isNonEmptyArray,
  isValidEmail,
  isValidUrl,
  isValidUUID,
  isDate,
  isValidISO8601,
  isApiSuccess,
  isApiError,
  isValidationError,
  hasId,
  hasTimestamps,
  
  // Utility functions
  assertNever,
  exhaustiveCheck,
  getEnvVar,
  getRequiredEnvVar,
  isJSONValue,
  safeJSONParse,
  safeJSONStringify
} from './utilities.js';

// Newsletter Editions type (generated from Supabase)
export type NewsletterEdition = import('./database').Database['public']['Tables']['newsletter_editions']['Row'];

// Newsletter Edition Episodes type (generated from Supabase)
export type NewsletterEditionEpisode = import('./database').Database['public']['Tables']['newsletter_edition_episodes']['Row']; 