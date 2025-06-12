/**
 * Advanced utility types and type guards for enhanced type safety
 * Includes generic helpers, validation utilities, and common patterns
 */
// Type Guards
export function isString(value) {
    return typeof value === 'string';
}
export function isNumber(value) {
    return typeof value === 'number' && !isNaN(value);
}
export function isBoolean(value) {
    return typeof value === 'boolean';
}
export function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function isArray(value) {
    return Array.isArray(value);
}
export function isNull(value) {
    return value === null;
}
export function isUndefined(value) {
    return value === undefined;
}
export function isNullOrUndefined(value) {
    return value === null || value === undefined;
}
export function isDefined(value) {
    return value !== null && value !== undefined;
}
export function isNonEmptyString(value) {
    return isString(value) && value.trim().length > 0;
}
export function isNonEmptyArray(value) {
    return isArray(value) && value.length > 0;
}
export function isValidEmail(value) {
    if (!isString(value))
        return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
}
export function isValidUrl(value) {
    if (!isString(value))
        return false;
    try {
        new URL(value);
        return true;
    }
    catch {
        return false;
    }
}
export function isValidUUID(value) {
    if (!isString(value))
        return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
}
export function isDate(value) {
    return value instanceof Date && !isNaN(value.getTime());
}
export function isValidISO8601(value) {
    if (!isString(value))
        return false;
    const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?([+-]\d{2}:\d{2}|Z)$/;
    return iso8601Regex.test(value);
}
// API Response Type Guards
export function isApiSuccess(response) {
    return isObject(response) && response.success === true && 'data' in response;
}
export function isApiError(response) {
    return isObject(response) && response.success === false && 'error' in response;
}
export function isValidationError(error) {
    return isArray(error) && error.every(item => isObject(item) && isString(item.field) && isString(item.message));
}
// Database Type Guards
export function hasId(obj) {
    return isObject(obj) && 'id' in obj && isString(obj.id);
}
export function hasTimestamps(obj) {
    return isObject(obj) &&
        'created_at' in obj && isString(obj.created_at) &&
        'updated_at' in obj && isString(obj.updated_at);
}
// Utility Functions
export function assertNever(value) {
    throw new Error(`Unexpected value: ${value}`);
}
export function exhaustiveCheck(value, handlers) {
    const handler = handlers[value];
    if (!handler) {
        throw new Error(`No handler found for value: ${String(value)}`);
    }
    return handler();
}
export function getEnvVar(key) {
    return process.env[key];
}
export function getRequiredEnvVar(key) {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Required environment variable ${key} is not set`);
    }
    return value;
}
export function isJSONValue(value) {
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return true;
    }
    if (Array.isArray(value)) {
        return value.every(isJSONValue);
    }
    if (typeof value === 'object' && value !== null) {
        return Object.values(value).every(isJSONValue);
    }
    return false;
}
export function safeJSONParse(str) {
    try {
        const parsed = JSON.parse(str);
        return { success: true, data: parsed };
    }
    catch (error) {
        return { success: false, error: error };
    }
}
export function safeJSONStringify(value) {
    try {
        const stringified = JSON.stringify(value);
        return { success: true, data: stringified };
    }
    catch (error) {
        return { success: false, error: error };
    }
}
