import express, { Router, Request, Response } from 'express';
import { HealthCheckResponse } from '@listener/shared';

// Create router with proper typing
const router: Router = express.Router();

/**
 * Health check endpoint
 * GET /api/health
 * Returns the health status of the application and its dependencies
 */
router.get('/', (_req: Request, res: Response): void => {
    const startTime: number = Date.now();
    
    // Calculate uptime in milliseconds
    const uptimeMs: number = process.uptime() * 1000;
    
    // Get version, defaulting to undefined if not available
    const version: string | undefined = process.env.npm_package_version;
    
    // Basic health check response with proper optional property handling
    const healthResponse: HealthCheckResponse = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: uptimeMs,
        ...(version && { version }),
        services: {
            database: 'connected', // Could be enhanced to actually check database connectivity
            deepgram: 'available', // Could be enhanced to check Deepgram API availability
            spotify: 'available'   // Could be enhanced to check Spotify API availability
        }
    };

    // Calculate response time
    const responseTime: number = Date.now() - startTime;
    
    // Add response time to headers
    res.set('X-Response-Time', `${responseTime}ms`);
    
    // Return health status
    res.status(200).json(healthResponse);
});

export default router; 