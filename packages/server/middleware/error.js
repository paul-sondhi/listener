/**
 * Global error handling middleware
 * Logs errors and sends appropriate error responses
 */
const errorHandler = (err, req, res, next) => {
    // Log the error
    console.error('Error:', err);

    // Set default status code to 500 if not specified
    const statusCode = err.statusCode || 500;

    // Send error response
    res.status(statusCode).json({
        error: err.message || 'Internal server error'
    });
};

export default errorHandler; 