/**
 * Global error handling middleware
 * Converts various error types into standardized API responses
 */
export const errorHandler = (error, _req, res, _next) => {
    // Log the error for debugging
    console.error('Error occurred:', error.message, error.stack);
    // Determine status code
    const statusCode = error.statusCode || 500;
    // Determine error message (don't expose internal errors in production)
    const message = process.env.NODE_ENV === 'production' && statusCode === 500
        ? 'Internal server error'
        : error.message || 'An unexpected error occurred';
    // Create standardized error response with proper typing
    const errorResponse = {
        success: false,
        error: message
    };
    // Add optional properties conditionally
    if (error.code) {
        errorResponse.code = error.code;
    }
    if (process.env.NODE_ENV === 'development') {
        if (error.details) {
            errorResponse.details = error.details;
        }
        if (error.stack) {
            errorResponse.stack = error.stack;
        }
    }
    // Send error response
    res.status(statusCode).json(errorResponse);
};
/**
 * 404 Not Found handler
 * Handles requests to non-existent endpoints
 */
export const notFoundHandler = (_req, res) => {
    const errorResponse = {
        success: false,
        error: `Endpoint not found`,
        code: 'ENDPOINT_NOT_FOUND'
    };
    res.status(404).json(errorResponse);
};
/**
 * Async error wrapper
 * Wraps async route handlers to catch errors automatically
 */
export const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
