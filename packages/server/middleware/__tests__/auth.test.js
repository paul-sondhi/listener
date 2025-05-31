import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import pathModuleActual from 'path'; // Import the actual module to reference its type if needed, but we mock it by string.

var mockSupabaseAdminAuthGetUser = vi.fn(); // Using var for hoisting behavior test

// Mock @supabase/supabase-js. The factory is hoisted.
vi.mock('@supabase/supabase-js', () => {
  // 'mockSupabaseAdminAuthGetUser' defined above should be accessible here.
  const localMockAuthObject = {
    getUser: mockSupabaseAdminAuthGetUser 
  };
  return {
    createClient: vi.fn(() => ({
      auth: localMockAuthObject,
    })),
  };
});

// Corrected mock for 'path' module to provide a default export
vi.mock('path', async () => {
  // const actualPath = await vi.importActual('path'); // If we needed to spread other original methods
  return {
    __esModule: true, // Important for ESM modules with default exports
    default: {
      // ...actualPath, // Spread original methods if any were needed and not mocked
      join: vi.fn((...args) => args.join('/')), // Specific mock for join
      dirname: vi.fn(filePath => { // Basic mock for dirname
        if (typeof filePath !== 'string') return '.';
        const lastSlash = filePath.lastIndexOf('/');
        if (lastSlash === -1) return '.';
        if (lastSlash === 0) return '/'; // Root directory
        return filePath.substring(0, lastSlash);
      }),
      // Add other path functions if auth.js or its dependencies use them, e.g. resolve, basename
      resolve: vi.fn((...args) => args.join('/')), // Simplified resolve
      basename: vi.fn(filePath => {
        if (typeof filePath !== 'string') return '';
        const lastSlash = filePath.lastIndexOf('/');
        return filePath.substring(lastSlash + 1);
      }),
      // Add any other functions from 'path' that might be used.
      sep: '/',
    },
  };
});

describe('Auth Middleware', () => {
  let mockReq, mockRes, mockNext;
  let pathJoinSpy, pathDirnameSpy; // Add spy for dirname if we need to check it
  let authMiddleware; // Declare authMiddleware here

  beforeEach(async () => { // Make beforeEach async
    vi.resetAllMocks();
    mockSupabaseAdminAuthGetUser.mockReset();

    // Dynamically import the middleware AFTER mocks are set up
    const module = await import('../auth'); 
    authMiddleware = module.default; // Assign the default export

    pathJoinSpy = vi.spyOn(pathModuleActual, 'join');
    pathDirnameSpy = vi.spyOn(pathModuleActual, 'dirname');
    
    pathJoinSpy.mockImplementation((...args) => {
      if (args.includes('login.html') && args.includes('public')) {
        return 'mocked/path/to/public/login.html';
      }
      let result = '';
      for (const arg of args) {
        if (result && !result.endsWith('/') && arg && !arg.startsWith('/')) {
          result += '/';
        }
        result += arg;
      }
      return result;
    });

    pathDirnameSpy.mockReturnValue('/mocked/middleware/directory'); 

    mockReq = { path: '/protected-route.html', cookies: {}, headers: {} };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      sendFile: vi.fn().mockReturnThis(),
      clearCookie: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();
  });

  afterEach(() => {
    // pathJoinSpy.mockRestore(); // vi.resetAllMocks() should handle spies on mocked modules
    // pathDirnameSpy.mockRestore();
  });

  // Test cases for paths that should skip authentication
  const publicPaths = [
    '/login.html',
    '/api/some-endpoint',
    '/styles.css',
    '/', // Root path, often serves index.html
    '/app.html',
    '/assets/image.png', // Example of non-html static asset
    '/some-file.js' // Example of non-html static asset
  ];

  publicPaths.forEach(publicPath => {
    it(`should call next() and skip auth for public path: ${publicPath}`, async () => {
      mockReq.path = publicPath;
      await authMiddleware(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
      expect(mockSupabaseAdminAuthGetUser).not.toHaveBeenCalled();
      expect(mockRes.sendFile).not.toHaveBeenCalled();
    });
  });

  it('should call next() if token is valid and user is found (token in cookie)', async () => {
    mockReq.cookies['sb-access-token'] = 'valid_token';
    mockSupabaseAdminAuthGetUser.mockResolvedValue({ data: { user: { id: '123', email: 'test@example.com' } }, error: null });

    await authMiddleware(mockReq, mockRes, mockNext);

    expect(mockSupabaseAdminAuthGetUser).toHaveBeenCalledWith('valid_token');
    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.sendFile).not.toHaveBeenCalled();
  });

  it('should call next() if token is valid and user is found (token in Authorization header)', async () => {
    mockReq.headers.authorization = 'Bearer valid_token_header';
    mockSupabaseAdminAuthGetUser.mockResolvedValue({ data: { user: { id: '123', email: 'test@example.com' } }, error: null });

    await authMiddleware(mockReq, mockRes, mockNext);

    expect(mockSupabaseAdminAuthGetUser).toHaveBeenCalledWith('valid_token_header');
    expect(mockNext).toHaveBeenCalled();
  });

  it('should return 401 if no token is provided for a protected route', async () => {
    await authMiddleware(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Not authenticated' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should redirect to login if Supabase auth.getUser returns an error', async () => {
    mockReq.cookies['sb-access-token'] = 'token_with_error';
    mockSupabaseAdminAuthGetUser.mockResolvedValue({ data: {}, error: new Error('Supabase auth error') });

    await authMiddleware(mockReq, mockRes, mockNext);

    expect(mockSupabaseAdminAuthGetUser).toHaveBeenCalledWith('token_with_error');
    expect(mockRes.clearCookie).toHaveBeenCalledWith('sb-access-token');
    expect(pathJoinSpy).toHaveBeenCalled();
    expect(mockRes.sendFile).toHaveBeenCalledWith('mocked/path/to/public/login.html');
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should redirect to login if Supabase auth.getUser returns no user', async () => {
    mockReq.cookies['sb-access-token'] = 'token_no_user';
    mockSupabaseAdminAuthGetUser.mockResolvedValue({ data: { user: null }, error: null });

    await authMiddleware(mockReq, mockRes, mockNext);
    
    expect(mockRes.clearCookie).toHaveBeenCalledWith('sb-access-token');
    expect(pathJoinSpy).toHaveBeenCalled();
    expect(mockRes.sendFile).toHaveBeenCalledWith('mocked/path/to/public/login.html');
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should redirect to login if Supabase auth.getUser throws an unexpected error', async () => {
    mockReq.cookies['sb-access-token'] = 'token_throws_error';
    mockSupabaseAdminAuthGetUser.mockRejectedValue(new Error('Unexpected Supabase crash'));

    await authMiddleware(mockReq, mockRes, mockNext);

    expect(mockRes.clearCookie).toHaveBeenCalledWith('sb-access-token');
    expect(pathJoinSpy).toHaveBeenCalled();
    expect(mockRes.sendFile).toHaveBeenCalledWith('mocked/path/to/public/login.html');
    expect(mockNext).not.toHaveBeenCalled();
  });
}); 