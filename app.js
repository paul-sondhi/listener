require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');

// Import middleware
const authMiddleware = require('./middleware/auth');
const errorHandler = require('./middleware/error');

// Import routes
const apiRoutes = require('./routes');

const app = express();

// Apply middleware
app.use(cookieParser());
app.use(authMiddleware);
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Root route redirects to login
app.get('/', (req, res) => {
    // If we have a valid token, redirect to app.html
    if (req.cookies['sb-access-token']) {
        return res.redirect('/app.html');
    }
    // Otherwise, serve login.html directly instead of redirecting
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Handle app.html route specifically
app.get('/app.html', async (req, res) => {
    const token = req.cookies['sb-access-token'];
    
    if (!token) {
        console.log('No token found for app.html, serving login page');
        return res.sendFile(path.join(__dirname, 'public', 'login.html'));
    }

    try {
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
        
        if (error || !user) {
            console.log('Invalid token for app.html, serving login page');
            res.clearCookie('sb-access-token');
            return res.sendFile(path.join(__dirname, 'public', 'login.html'));
        }
        
        // If we have a valid user, serve app.html
        res.sendFile(path.join(__dirname, 'public', 'app.html'));
    } catch (error) {
        console.error('Error checking auth for app.html:', error);
        res.clearCookie('sb-access-token');
        return res.sendFile(path.join(__dirname, 'public', 'login.html'));
    }
});

// Mount API routes
app.use('/api', apiRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

module.exports = app; 