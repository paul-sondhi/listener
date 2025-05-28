import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { app, initializeMiddleware } from './app.js';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from the root .env file
const result = config({ path: join(__dirname, '../../.env') });

// Debug logging
// console.log('Environment variables loaded:', {
//     SUPABASE_URL: process.env.SUPABASE_URL,
//     SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'present' : 'missing',
//     configResult: result
// });

const PORT = process.env.PORT || 3000;

// Initialize middleware and start server
initializeMiddleware().then(() => {
    app.listen(PORT, () => {
        console.log(`Listening on http://localhost:${PORT}`);
    });
});