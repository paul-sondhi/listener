// Test suite for server.js
// This file verifies the root health check endpoint and server initialization.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';

// Dynamically import parts of server.js
// We need to ensure mocks are set up before the server tries to use them.
let app;
let initializeServer;

// Mock middleware and other dependencies that might be problematic in a test environment
// or that we want to control for specific test cases.

// Mock auth.js
const mockAuthMiddleware = vi.fn((req, res, next) => next());
vi.mock('../middleware/auth.js', () => ({
  default: mockAuthMiddleware
}));

// Mock error.js
const mockErrorHandler = vi.fn((err, req, res, next) => {
  res.status(500).json({ error: 'mocked error' });
});
vi.mock('../middleware/error.js', () => ({
  default: mockErrorHandler
}));

// Mock API routes (we're not testing them here, just ensuring server can load)
const mockApiRoutes = vi.fn((req, res, next) => next());
vi.mock('../routes/index.js', () => ({
  default: mockApiRoutes
}));


describe('Server Application (server.js)', () => {
  let serverInstance;

  beforeAll(async () => {
    // Import server.js *after* mocks are defined.
    const serverModule = await import('../server.js');
    app = serverModule.app;
    initializeServer = serverModule.initializeServer;

    // Prevent the server from actually listening on a port during tests
    // by mocking app.listen before initializeServer is called.
    vi.spyOn(app, 'listen').mockImplementation((port, callback) => {
      // console.log(`Mock app.listen called on port ${port}`);
      if (callback) callback();
      // Return a dummy server object with a close method
      serverInstance = {
        close: (cb) => {
          // console.log('Mock serverInstance.close called');
          if (cb) cb();
        }
      };
      return serverInstance;
    });

    // Call initializeServer to apply middleware etc.
    // We are not testing the listen part here, but the setup.
    await initializeServer(); 
  });

  afterAll(() => {
    // Restore mocks
    vi.restoreAllMocks();
    // Ensure the mock server is "closed"
    if (serverInstance && serverInstance.close) {
      serverInstance.close();
    }
  });

  describe('Root Health Check Endpoint', () => {
    it('GET /healthz should return 200 OK', async () => {
      // This tests the app.get('/healthz', ...) defined directly in server.js
      const response = await request(app).get('/healthz');
      expect(response.status).toBe(200);
    });
  });

  describe('Server Initialization (initializeServer)', () => {
    // Test for successful initialization (middleware application)
    it('should apply authMiddleware and errorHandler', async () => {
      // initializeServer is called in beforeAll.
      // We check if the middleware were added to the app's stack.
      // This is an indirect way to check. A more direct way would be to inspect app._router.stack,
      // but that's an internal API. Mocking and checking calls is more robust.
      
      // To test if they are USED, we can send a request that would pass through them.
      // For example, a request to a non-existent API route should hit the errorHandler.
      mockApiRoutes.mockImplementationOnce((req, res, next) => { next(); }); // Ensure it goes to errorHandler
      mockAuthMiddleware.mockClear(); // Clear previous calls if any
      mockErrorHandler.mockClear();

      await request(app).get('/api/some-test-route');

      // Check if auth middleware was called by a request going to /api/*
      expect(mockAuthMiddleware).toHaveBeenCalled();
      
      // Check if error handler was called (assuming /api/some-test-route doesn't exist
      // and that the apiRouter calls next() for unhandled routes, eventually hitting the errorHandler)
      // This depends on the actual behavior of mockApiRoutes and how Express handles it.
      // If apiRoutes sends a 404 itself, errorHandler might not be called.
      // Let's refine this: test that it's present in the middleware stack or called on error.

      // More direct check: The initializeServer in beforeAll should have set them up.
      // Let's check the app's router stack if possible (though it's internal)
      const authMiddlewareEntry = app._router.stack.find(layer => layer.handle === mockAuthMiddleware);
      const errorHandlerEntry = app._router.stack.find(layer => layer.handle === mockErrorHandler);

      expect(authMiddlewareEntry).toBeDefined();
      expect(errorHandlerEntry).toBeDefined();
    });

    // Test for error handling during dynamic imports in initializeServer
    // This is more complex as it requires making a dynamic import fail.
    it('should log an error and exit if dynamic import of authMiddleware fails', async () => {
      vi.resetModules(); 
      
      const mockProcessExit = vi.spyOn(process, 'exit').mockImplementation((code) => {
        // No-op: Prevents the test runner from seeing an unhandled rejection
        // We will still assert that it was called.
      });
      const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      vi.doMock('../middleware/auth.js', () => {
        throw new Error('Failed to import auth.js');
      });

      // With process.exit mocked as a no-op, initializeServer will run to completion (or until another error)
      // but it will attempt to call our mocked process.exit.
      const serverModuleRetry = await import('../server.js');
      await serverModuleRetry.initializeServer(); 

      expect(mockConsoleError).toHaveBeenCalledWith(
        'Failed to initialize server:',
        expect.objectContaining({ cause: expect.objectContaining({ message: 'Failed to import auth.js' }) })
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);

      mockProcessExit.mockRestore();
      mockConsoleError.mockRestore();
      vi.doUnmock('../middleware/auth.js'); 
      vi.doMock('../middleware/auth.js', () => ({ default: mockAuthMiddleware })); 
    });

    it('should log an error and exit if dynamic import of errorHandler fails', async () => {
      vi.resetModules();
      const mockProcessExit = vi.spyOn(process, 'exit').mockImplementation((code) => {
        // No-op
      });
      const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      vi.doMock('../middleware/auth.js', () => ({ default: mockAuthMiddleware }));
      vi.doMock('../middleware/error.js', () => {
        throw new Error('Failed to import error.js');
      });

      const serverModuleRetry = await import('../server.js');
      await serverModuleRetry.initializeServer();

      expect(mockConsoleError).toHaveBeenCalledWith(
        'Failed to initialize server:',
        expect.objectContaining({ cause: expect.objectContaining({ message: 'Failed to import error.js' }) })
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);

      mockProcessExit.mockRestore();
      mockConsoleError.mockRestore();
      vi.doUnmock('../middleware/error.js');
      vi.doMock('../middleware/error.js', () => ({ default: mockErrorHandler })); 
    });
  });
}); 