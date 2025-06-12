import { Request, Response, NextFunction } from 'express';
interface CustomError extends Error {
    statusCode?: number;
    code?: string;
    details?: unknown;
}
/**
 * Global error handling middleware
 * Converts various error types into standardized API responses
 */
export declare const errorHandler: (error: CustomError, _req: Request, res: Response, _next: NextFunction) => void;
/**
 * 404 Not Found handler
 * Handles requests to non-existent endpoints
 */
export declare const notFoundHandler: (_req: Request, res: Response) => void;
/**
 * Async error wrapper
 * Wraps async route handlers to catch errors automatically
 */
export declare const asyncHandler: (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => void;
export {};
//# sourceMappingURL=error.d.ts.map