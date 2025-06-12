/**
 * Unit tests for packages/server/middleware/error.ts
 * Tests the error handling middleware for Express routes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { MockInstance } from 'vitest'
import type { Request, Response, NextFunction } from 'express'

// Type definitions for test utilities
type _MockRequest = Partial<Request>;

interface _MockResponse {
  status: MockInstance
  json: MockInstance
}

interface CustomError extends Error {
  statusCode?: number
}

describe('Error Handling Middleware', () => {
  let mockReq: _MockRequest
  let mockRes: _MockResponse
  let mockNext: MockInstance
  let mockError: CustomError
  let errorHandler: (err: any, req: Request, res: Response, next: NextFunction) => void
  let consoleErrorSpy: MockInstance

  beforeEach(async () => {
    // Dynamically import the error handler AFTER mocks are set up
    const module = await import('../error')
    errorHandler = module.errorHandler

    // Reset mocks and error object before each test
    mockReq = {} // Request object, not typically used by this simple error handler
    mockRes = {
      status: vi.fn().mockReturnThis(), // Allows chaining .status().json()
      json: vi.fn().mockReturnThis(),   // Allows asserting what was sent as JSON
    }
    mockNext = vi.fn() // Next function, not typically called by a terminal error handler
    mockError = new Error('Test error') as CustomError // Default error

    // Spy on console.error to ensure it's called
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}) // Suppress actual console output during tests
  })

  afterEach(() => {
    // Restore the original console.error after each test
    vi.restoreAllMocks()
  })

  it('should log the error to console.error', () => {
    // Act
    errorHandler(mockError, mockReq as Request, mockRes as unknown as Response, mockNext as unknown as NextFunction)

    // Assert
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error occurred:', 'Test error', expect.any(String))
  })

  it('should send a 500 status code by default if error has no statusCode', () => {
    // Act
    errorHandler(mockError, mockReq as Request, mockRes as unknown as Response, mockNext as unknown as NextFunction)

    // Assert
    expect(mockRes.status).toHaveBeenCalledWith(500)
    expect(mockRes.json).toHaveBeenCalledWith({ success: false, error: 'Test error' })
  })

  it('should use err.statusCode if provided', () => {
    // Arrange
    mockError.statusCode = 400

    // Act
    errorHandler(mockError, mockReq as Request, mockRes as unknown as Response, mockNext as unknown as NextFunction)

    // Assert
    expect(mockRes.status).toHaveBeenCalledWith(400)
    expect(mockRes.json).toHaveBeenCalledWith({ success: false, error: 'Test error' })
  })

  it('should use err.message for the error response', () => {
    // Arrange
    mockError.message = 'Custom error message'

    // Act
    errorHandler(mockError, mockReq as Request, mockRes as unknown as Response, mockNext as unknown as NextFunction)

    // Assert
    expect(mockRes.json).toHaveBeenCalledWith({ success: false, error: 'Custom error message' })
  })

  it('should send "An unexpected error occurred" if err.message is not provided', () => {
    // Arrange
    const errorWithoutMessage = {} // An error object without a message property

    // Act
    errorHandler(errorWithoutMessage, mockReq as Request, mockRes as unknown as Response, mockNext as unknown as NextFunction)

    // Assert
    expect(mockRes.status).toHaveBeenCalledWith(500) // Default status code
    expect(mockRes.json).toHaveBeenCalledWith({ success: false, error: 'An unexpected error occurred' })
  })

  it('should handle an error with a specific statusCode and custom message', () => {
    // Arrange
    mockError.statusCode = 403
    mockError.message = 'Forbidden access'

    // Act
    errorHandler(mockError, mockReq as Request, mockRes as unknown as Response, mockNext as unknown as NextFunction)

    // Assert
    expect(mockRes.status).toHaveBeenCalledWith(403)
    expect(mockRes.json).toHaveBeenCalledWith({ success: false, error: 'Forbidden access' })
  })

  // This middleware is a terminal one, so it typically does not call next()
  it('should not call next()', () => {
    // Act
    errorHandler(mockError, mockReq as Request, mockRes as unknown as Response, mockNext as unknown as NextFunction)

    // Assert
    expect(mockNext).not.toHaveBeenCalled()
  })
}) 