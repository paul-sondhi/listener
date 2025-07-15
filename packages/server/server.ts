console.log('MAIN SERVER ENTRYPOINT: packages/server/server.ts loaded');
import express, { Application, Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import cors, { CorsOptions } from 'cors';
import { createProxyMiddleware } from 'http-proxy-middleware';
import dotenv from 'dotenv';
import './lib/debugFilter.js';

// Get __dirname equivalent in ES modules
const __filename: string = fileURLToPath(import.meta.url);
const __dirname: string = path.dirname(__filename);

// Load environment variables
// Priority: 1) .env.local (for local dev overrides) 2) .env (default)  
// In production (Render / Vercel) env vars are injected by the platform so these files are ignored.
const envLocalPath = path.join(__dirname, '../../.env.local');
const envDefaultPath = path.join(__dirname, '../../.env');

// Load .env.local first if it exists, then fallback to .env
dotenv.config({ path: envDefaultPath }); // base
dotenv.config({ path: envLocalPath, override: true });

// Import routes
import apiRoutes from './routes/index.js';

// Import services
import { initializeBackgroundJobs } from './services/backgroundJobs.js';
import * as tokenService from './services/tokenService.js';
import { encryptedTokenHealthCheck } from './lib/encryptedTokenHelpers.js';

// Create Express application with proper typing
const app: Application = express();

// Apply base middleware
app.use(cookieParser());
app.use(express.json());

// CORS configuration with proper typing
const corsOptions: CorsOptions = {
  origin: [
    'https://getlistener.app',
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
app.get('/healthz', (_req: Request, res: Response): void => {
  res.sendStatus(200);
});

// ---------------------------------------------------------------------------
// Safe Health Check Wrapper
// ---------------------------------------------------------------------------
// In many test suites we partially mock `tokenService`, omitting the `healthCheck`
// export.  Accessing an undefined export would throw, so we gracefully fall back
// to a no-op implementation when the function is absent.

const safeHealthCheck: () => Promise<boolean> =
  typeof tokenService.healthCheck === 'function'
    ? tokenService.healthCheck
    : async () => true; // assume healthy when mock does not provide implementation

// Enhanced health check endpoint with encrypted token storage connectivity
app.get('/health', async (_req: Request, res: Response): Promise<void> => {
  try {
    const [tokenServiceHealthy, encryptedTokenHealthy] = await Promise.all([
      safeHealthCheck(),
      encryptedTokenHealthCheck()
    ]);
    
    if (tokenServiceHealthy && encryptedTokenHealthy) {
      res.status(200).json({
        status: 'healthy',
        encryptedTokenStorage: 'connected',
        tokenService: 'connected',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        status: 'unhealthy',
        encryptedTokenStorage: encryptedTokenHealthy ? 'connected' : 'disconnected',
        tokenService: tokenServiceHealthy ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(503).json({
      status: 'unhealthy',
      error: errorMessage,
      timestamp: new Date().toISOString()
    });
  }
});

// Server configuration with environment variable typing
const PORT: number = parseInt(process.env.PORT || '3000', 10);

// Initialize additional middleware and start server
const initializeServer = async (): Promise<void> => {
    try {
        // Development vs Production configuration
        const isDevEnvironment: boolean = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
        
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
        app.listen(PORT, async (): Promise<void> => {
            console.log(`Server running on http://localhost:${PORT}`);
            console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
            
            // Verify environment variables are accessible
            console.log('Verifying environment variables...');
            const { verifyTaddyApiKey } = await import('./lib/utils.js');
            const taddyKeyValid = verifyTaddyApiKey();
            console.log(`TADDY_API_KEY validation: ${taddyKeyValid ? 'PASSED' : 'FAILED'}`);
            
            // Initialize background jobs after server starts
            console.log('Initializing background jobs...');
            initializeBackgroundJobs();
            
            // Perform initial health check
            Promise.all([safeHealthCheck(), encryptedTokenHealthCheck()]).then(([tokenHealthy, encryptedTokenHealthy]) => {
                if (tokenHealthy && encryptedTokenHealthy) {
                    console.log('✅ Health checks passed - system ready');
                } else {
                    console.warn(`⚠️  Health check issues - Token Service: ${tokenHealthy ? 'OK' : 'FAIL'}, Encrypted Token Storage: ${encryptedTokenHealthy ? 'OK' : 'FAIL'}`);
                }
            }).catch(error => {
                console.error('❌ Health check error:', error.message);
            });
        });
    } catch (error: unknown) {
        // Enhanced error handling with proper typing
        const errorMessage: string = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Failed to initialize server:', errorMessage);
        process.exit(1);
    }
};

// Start the server (skip automatic startup during unit/integration tests to avoid conflicts)
if (process.env.NODE_ENV !== 'test') {
  initializeServer().catch((error: unknown) => {
    const errorMessage: string = error instanceof Error ? error.message : 'Unknown error in server initialization';
    console.error('Server initialization failed:', errorMessage);
    process.exit(1);
  });
}

// Export app and initializeServer for testing or other programmatic use
export { app, initializeServer }; 