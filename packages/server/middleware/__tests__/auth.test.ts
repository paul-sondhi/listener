/**
 * Unit tests for packages/server/middleware/auth.ts
 * Tests the authentication middleware for protecting routes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { MockInstance } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import pathModuleActual from 'path'

// Type definitions for test utilities
interface MockRequest extends Partial<Request> {
  path: string
  cookies: Record<string, string>
  headers: Record<string, string>
}

interface MockResponse extends Partial<Response> {
  status: MockInstance
  json: MockInstance
  sendFile: MockInstance
  clearCookie: MockInstance
}

interface MockSupabaseUser {
  id: string
  email: string
}

interface MockSupabaseAuthResult {
  data: {
    user?: MockSupabaseUser | null
  }
  error?: Error | null
}

// Mock for Supabase admin auth.getUser
const mockSupabaseAdminAuthGetUser = vi.fn() as MockInstance<[string], Promise<MockSupabaseAuthResult>>

// Mock @supabase/supabase-js with proper TypeScript typing
vi.mock('@supabase/supabase-js', () => {
  const localMockAuthObject = {
    getUser: mockSupabaseAdminAuthGetUser,
  }
  return {
    createClient: vi.fn(() => ({
      auth: localMockAuthObject,
    })),
  }
})

// Mock the 'path' module with comprehensive function implementations
vi.mock('path', async () => {
  return {
    __esModule: true,
    default: {
      join: vi.fn((...args: string[]) => args.join('/')),
      dirname: vi.fn((filePath: string) => {
        if (typeof filePath !== 'string') return '.'
        const lastSlash = filePath.lastIndexOf('/')
        if (lastSlash === -1) return '.'
        if (lastSlash === 0) return '/'
        return filePath.substring(0, lastSlash)
      }),
      resolve: vi.fn((...args: string[]) => args.join('/')),
      basename: vi.fn((filePath: string) => {
        if (typeof filePath !== 'string') return ''
        const lastSlash = filePath.lastIndexOf('/')
        return filePath.substring(lastSlash + 1)
      }),
      sep: '/',
    },
  }
})

describe('Auth Middleware', () => {
  let mockReq: MockRequest
  let mockRes: MockResponse
  let mockNext: MockInstance<[], void>
  let pathJoinSpy: MockInstance
  let pathDirnameSpy: MockInstance
  let authMiddleware: (req: Request, res: Response, next: NextFunction) => Promise<void>

  beforeEach(async () => {
    // Reset all mocks to ensure clean state
    vi.resetAllMocks()
    mockSupabaseAdminAuthGetUser.mockReset()

    // Dynamically import the middleware AFTER mocks are set up
    const module = await import('../auth')
    authMiddleware = module.default

    // Setup spies for path module functions
    pathJoinSpy = vi.spyOn(pathModuleActual, 'join')
    pathDirnameSpy = vi.spyOn(pathModuleActual, 'dirname')

    // Configure path.join mock for login.html redirects
    pathJoinSpy.mockImplementation((...args: string[]) => {
      if (args.includes('login.html') && args.includes('public')) {
        return 'mocked/path/to/public/login.html'
      }
      let result = ''
      for (const arg of args) {
        if (result && !result.endsWith('/') && arg && !arg.startsWith('/')) {
          result += '/'
        }
        result += arg
      }
      return result
    })

    pathDirnameSpy.mockReturnValue('/mocked/middleware/directory')

    // Setup mock request object
    mockReq = {
      path: '/protected-route.html',
      cookies: {},
      headers: {},
    }

    // Setup mock response object with chaining methods
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      sendFile: vi.fn().mockReturnThis(),
      clearCookie: vi.fn().mockReturnThis(),
    }

    // Setup mock next function
    mockNext = vi.fn()
  })

  afterEach(() => {
    // Cleanup is handled by vi.resetAllMocks() in beforeEach
  })

  // Test cases for paths that should skip authentication
  const publicPaths = [
    '/login.html',
    '/api/some-endpoint',
    '/styles.css',
    '/', // Root path, often serves index.html
    '/app.html',
    '/assets/image.png', // Example of non-html static asset
    '/some-file.js', // Example of non-html static asset
  ]

  publicPaths.forEach((publicPath) => {
    it(`should call next() and skip auth for public path: ${publicPath}`, async () => {
      // Arrange
      mockReq.path = publicPath

      // Act
      await authMiddleware(mockReq as Request, mockRes as Response, mockNext)

      // Assert
      expect(mockNext).toHaveBeenCalled()
      expect(mockSupabaseAdminAuthGetUser).not.toHaveBeenCalled()
      expect(mockRes.sendFile).not.toHaveBeenCalled()
    })
  })

  it('should call next() if token is valid and user is found (token in cookie)', async () => {
    // Arrange
    mockReq.cookies['sb-access-token'] = 'valid_token'
    const mockUserResult: MockSupabaseAuthResult = {
      data: { user: { id: '123', email: 'test@example.com' } },
      error: null,
    }
    mockSupabaseAdminAuthGetUser.mockResolvedValue(mockUserResult)

    // Act
    await authMiddleware(mockReq as Request, mockRes as Response, mockNext)

    // Assert
    expect(mockSupabaseAdminAuthGetUser).toHaveBeenCalledWith('valid_token')
    expect(mockNext).toHaveBeenCalled()
    expect(mockRes.sendFile).not.toHaveBeenCalled()
  })

  it('should call next() if token is valid and user is found (token in Authorization header)', async () => {
    // Arrange
    mockReq.headers.authorization = 'Bearer valid_token_header'
    const mockUserResult: MockSupabaseAuthResult = {
      data: { user: { id: '123', email: 'test@example.com' } },
      error: null,
    }
    mockSupabaseAdminAuthGetUser.mockResolvedValue(mockUserResult)

    // Act
    await authMiddleware(mockReq as Request, mockRes as Response, mockNext)

    // Assert
    expect(mockSupabaseAdminAuthGetUser).toHaveBeenCalledWith('valid_token_header')
    expect(mockNext).toHaveBeenCalled()
  })

  it('should return 401 if no token is provided for a protected route', async () => {
    // Act
    await authMiddleware(mockReq as Request, mockRes as Response, mockNext)

    // Assert
    expect(mockRes.status).toHaveBeenCalledWith(401)
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Not authenticated' })
    expect(mockNext).not.toHaveBeenCalled()
  })

  it('should redirect to login if Supabase auth.getUser returns an error', async () => {
    // Arrange
    mockReq.cookies['sb-access-token'] = 'token_with_error'
    const mockErrorResult: MockSupabaseAuthResult = {
      data: {},
      error: new Error('Supabase auth error'),
    }
    mockSupabaseAdminAuthGetUser.mockResolvedValue(mockErrorResult)

    // Act
    await authMiddleware(mockReq as Request, mockRes as Response, mockNext)

    // Assert
    expect(mockSupabaseAdminAuthGetUser).toHaveBeenCalledWith('token_with_error')
    expect(mockRes.clearCookie).toHaveBeenCalledWith('sb-access-token')
    expect(pathJoinSpy).toHaveBeenCalled()
    expect(mockRes.sendFile).toHaveBeenCalledWith('mocked/path/to/public/login.html')
    expect(mockNext).not.toHaveBeenCalled()
  })

  it('should redirect to login if Supabase auth.getUser returns no user', async () => {
    // Arrange
    mockReq.cookies['sb-access-token'] = 'token_no_user'
    const mockNoUserResult: MockSupabaseAuthResult = {
      data: { user: null },
      error: null,
    }
    mockSupabaseAdminAuthGetUser.mockResolvedValue(mockNoUserResult)

    // Act
    await authMiddleware(mockReq as Request, mockRes as Response, mockNext)

    // Assert
    expect(mockRes.clearCookie).toHaveBeenCalledWith('sb-access-token')
    expect(pathJoinSpy).toHaveBeenCalled()
    expect(mockRes.sendFile).toHaveBeenCalledWith('mocked/path/to/public/login.html')
    expect(mockNext).not.toHaveBeenCalled()
  })

  it('should redirect to login if Supabase auth.getUser throws an unexpected error', async () => {
    // Arrange
    mockReq.cookies['sb-access-token'] = 'token_throws_error'
    mockSupabaseAdminAuthGetUser.mockRejectedValue(new Error('Unexpected Supabase crash'))

    // Act
    await authMiddleware(mockReq as Request, mockRes as Response, mockNext)

    // Assert
    expect(mockRes.clearCookie).toHaveBeenCalledWith('sb-access-token')
    expect(pathJoinSpy).toHaveBeenCalled()
    expect(mockRes.sendFile).toHaveBeenCalledWith('mocked/path/to/public/login.html')
    expect(mockNext).not.toHaveBeenCalled()
  })
}) 