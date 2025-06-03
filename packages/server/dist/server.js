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
        });
    }
    catch (error) {
        // Enhanced error handling with proper typing
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Failed to initialize server:', errorMessage);
        process.exit(1);
    }
};
// Start the server
initializeServer().catch((error) => {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error in server initialization';
    console.error('Server initialization failed:', errorMessage);
    process.exit(1);
});
// Export app and initializeServer for testing or other programmatic use
export { app, initializeServer };
