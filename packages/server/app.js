import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import { createProxyMiddleware } from 'http-proxy-middleware';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import routes
import apiRoutes from './routes/index.js';

const app = express();

// Apply middleware
app.use(cookieParser());
app.use(express.json());

// Mount API routes first
app.use('/api', apiRoutes);

if (process.env.NODE_ENV === 'development') {
    // Use proxy in development
    app.use('/', createProxyMiddleware({
        target: 'http://localhost:5173',
        changeOrigin: true,
        ws: true // Enable WebSocket proxying for HMR
    }));
} else {
    // Serve static files from Vite build
    app.use(express.static(path.join(__dirname, 'client/dist')));
    
    // Catch-all: serve index.html for React Router
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'client/dist/index.html'));
    });
}

// Initialize middleware after environment variables are loaded
const initializeMiddleware = async () => {
    const { default: authMiddleware } = await import('./middleware/auth.js');
    const { default: errorHandler } = await import('./middleware/error.js');
    
    // Apply auth middleware after static files
    app.use(authMiddleware);
    
    // Error handling middleware (must be last)
    app.use(errorHandler);
};

export { app, initializeMiddleware }; 