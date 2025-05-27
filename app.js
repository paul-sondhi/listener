require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const { createProxyMiddleware } = require('http-proxy-middleware');

// Import middleware
const authMiddleware = require('./middleware/auth');
const errorHandler = require('./middleware/error');

// Import routes
const apiRoutes = require('./routes');

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

// Apply auth middleware after static files
app.use(authMiddleware);

// Error handling middleware (must be last)
app.use(errorHandler);

module.exports = app; 