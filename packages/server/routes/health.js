import express from 'express';
const router = express.Router();

// Simple health check endpoint that returns 200 OK
// This is used by Render's readiness probe to check if the service is up
router.get('/', (req, res) => {
    res.status(200).json({ status: 'success', message: 'Server is healthy' });
});

export default router; 