import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { createProxyMiddleware } from 'http-proxy-middleware';
import dotenvFlow from 'dotenv-flow';
// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Load environment variables from the root directory
dotenvFlow.config({
    path: path.join(__dirname, '../../'), // Point to root directory where .env files are located
    silent: false // Show debug info
});
// Import routes
import apiRoutes from './routes/index.js';
// Import services
import { initializeBackgroundJobs } from './services/backgroundJobs.js';
import * as tokenService from './services/tokenService.js';
import { vaultHealthCheck } from './lib/vaultHelpers.js';
// Create Express application with proper typing
const app = express();
// Apply base middleware
app.use(cookieParser());
app.use(express.json());
// CORS configuration with proper typing
const corsOptions = {
    origin: [
        'https://listener-seven.vercel.app',
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:3000'
    ],
    credentials: true,
};
// Enable CORS for Vercel front-end and local dev (including preflight)
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
// Mount API routes
app.use('/api', apiRoutes);
// Health check endpoint for Render with proper typing
app.get('/healthz', (_req, res) => {
    res.sendStatus(200);
});
// ---------------------------------------------------------------------------
// Safe Health Check Wrapper
// ---------------------------------------------------------------------------
// In many test suites we partially mock `tokenService`, omitting the `healthCheck`
// export.  Accessing an undefined export would throw, so we gracefully fall back
// to a no-op implementation when the function is absent.
const safeHealthCheck = typeof tokenService.healthCheck === 'function'
    ? tokenService.healthCheck
    : async () => true; // assume healthy when mock does not provide implementation
// Enhanced health check endpoint with vault connectivity
app.get('/health', async (_req, res) => {
    try {
        const [tokenServiceHealthy, vaultHealthy] = await Promise.all([
            safeHealthCheck(),
            vaultHealthCheck()
        ]);
        if (tokenServiceHealthy && vaultHealthy) {
            res.status(200).json({
                status: 'healthy',
                vault: 'connected',
                tokenService: 'connected',
                timestamp: new Date().toISOString()
            });
        }
        else {
            res.status(503).json({
                status: 'unhealthy',
                vault: vaultHealthy ? 'connected' : 'disconnected',
                tokenService: tokenServiceHealthy ? 'connected' : 'disconnected',
                timestamp: new Date().toISOString()
            });
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.status(503).json({
            status: 'unhealthy',
            error: errorMessage,
            timestamp: new Date().toISOString()
        });
    }
});
// Server configuration with environment variable typing
const PORT = parseInt(process.env.PORT || '3000', 10);
// Initialize additional middleware and start server
const initializeServer = async () => {
    try {
        // Development vs Production configuration
        const isDevEnvironment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
        if (isDevEnvironment) {
            // Use proxy in development for Vite HMR
            app.use('/', createProxyMiddleware({
                target: 'http://localhost:5173',
                changeOrigin: true,
                ws: true // Enable WebSocket proxying for HMR
            }));
        }
        // Import middleware dynamically with proper typing
        const { default: authMiddleware } = await import('./middleware/auth.js');
        const { errorHandler, notFoundHandler } = await import('./middleware/error.js');
        // Apply auth middleware after static files
        app.use(authMiddleware);
        // Add 404 handler for unmatched routes
        app.use(notFoundHandler);
        // Error handling middleware (must be last)
        app.use(errorHandler);
        // Start the server with proper callback typing
        app.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
            console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
            // Initialize background jobs after server starts
            console.log('Initializing background jobs...');
            initializeBackgroundJobs();
            // Perform initial health check
            Promise.all([safeHealthCheck(), vaultHealthCheck()]).then(([tokenHealthy, vaultHealthy]) => {
                if (tokenHealthy && vaultHealthy) {
                    console.log('✅ Health checks passed - system ready');
                }
                else {
                    console.warn(`⚠️  Health check issues - Token Service: ${tokenHealthy ? 'OK' : 'FAIL'}, Vault: ${vaultHealthy ? 'OK' : 'FAIL'}`);
                }
            }).catch(error => {
                console.error('❌ Health check error:', error.message);
            });
        });
    }
    catch (error) {
        // Enhanced error handling with proper typing
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Failed to initialize server:', errorMessage);
        process.exit(1);
    }
};
// Start the server (skip automatic startup during unit/integration tests to avoid conflicts)
if (process.env.NODE_ENV !== 'test') {
    initializeServer().catch((error) => {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error in server initialization';
        console.error('Server initialization failed:', errorMessage);
        process.exit(1);
    });
}
// Export app and initializeServer for testing or other programmatic use
export { app, initializeServer };
