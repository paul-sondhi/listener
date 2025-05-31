import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import errorHandler from '../error'; // Adjust path as necessary

describe('Error Handling Middleware', () => {
  let mockReq, mockRes, mockNext, mockError;

  beforeEach(() => {
    // Reset mocks and error object before each test
    mockReq = {}; // Request object, not typically used by this simple error handler
    mockRes = {
      status: vi.fn().mockReturnThis(), // Allows chaining .status().json()
      json: vi.fn().mockReturnThis(),   // Allows asserting what was sent as JSON
    };
    mockNext = vi.fn(); // Next function, not typically called by a terminal error handler
    mockError = new Error('Test error'); // Default error

    // Spy on console.error to ensure it's called
    vi.spyOn(console, 'error').mockImplementation(() => {}); // Suppress actual console output during tests
  });

  afterEach(() => {
    // Restore the original console.error after each test
    vi.restoreAllMocks();
  });

  it('should log the error to console.error', () => {
    errorHandler(mockError, mockReq, mockRes, mockNext);
    expect(console.error).toHaveBeenCalledWith('Error:', mockError);
  });

  it('should send a 500 status code by default if error has no statusCode', () => {
    errorHandler(mockError, mockReq, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Test error' });
  });

  it('should use err.statusCode if provided', () => {
    mockError.statusCode = 400;
    errorHandler(mockError, mockReq, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Test error' });
  });

  it('should use err.message for the error response', () => {
    mockError.message = 'Custom error message';
    errorHandler(mockError, mockReq, mockRes, mockNext);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Custom error message' });
  });

  it('should send "Internal server error" if err.message is not provided', () => {
    const errorWithoutMessage = {}; // An error object without a message property
    errorHandler(errorWithoutMessage, mockReq, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(500); // Default status code
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });

  it('should handle an error with a specific statusCode and custom message', () => {
    mockError.statusCode = 403;
    mockError.message = 'Forbidden access';
    errorHandler(mockError, mockReq, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Forbidden access' });
  });

  // This middleware is a terminal one, so it typically does not call next()
  it('should not call next()', () => {
    errorHandler(mockError, mockReq, mockRes, mockNext);
    expect(mockNext).not.toHaveBeenCalled();
  });
}); 