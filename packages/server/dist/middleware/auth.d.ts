import { Request, Response, NextFunction } from 'express';
interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        email: string;
        [key: string]: unknown;
    };
}
/**
 * Authentication middleware for protecting routes
 * Skips auth check for login page, API routes, and static assets
 * Verifies the user's token from either cookie or Authorization header
 */
declare const authMiddleware: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>;
export default authMiddleware;
export type { AuthenticatedRequest };
//# sourceMappingURL=auth.d.ts.map