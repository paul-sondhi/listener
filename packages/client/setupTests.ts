/**
 * Test setup for client-side React components
 * Configures testing environment, matchers, and global utilities
 */

// Import DOM testing library matchers
import '@testing-library/jest-dom'

// Import Vitest matchers and utilities
import { vi } from 'vitest'

// Global test utilities and mocks
declare global {
  interface ViJestAssertion<_T = unknown> {
    toBeInTheDocument(): void
    toHaveAttribute(attr: string, value?: string): void
    toHaveClass(className: string): void
    toHaveStyle(style: string | Record<string, unknown>): void
    toHaveTextContent(content: string | RegExp): void
    toBeVisible(): void
    toBeDisabled(): void
    toBeEnabled(): void
    toBeChecked(): void
    toHaveValue(value: string | number): void
    toHaveFocus(): void
  }
}

// Mock window.matchMedia for components that use media queries
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock window.ResizeObserver for components that observe element resize
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock IntersectionObserver for components that use intersection observation
global.IntersectionObserver = vi.fn().mockImplementation((_callback: IntersectionObserverCallback) => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
  root: null,
  rootMargin: '0px',
  thresholds: [],
}))

// Mock URL.createObjectURL for file handling tests
Object.defineProperty(URL, 'createObjectURL', {
  writable: true,
  value: vi.fn(() => 'mocked-object-url'),
})

Object.defineProperty(URL, 'revokeObjectURL', {
  writable: true,
  value: vi.fn(),
})

// Mock HTMLElement.scrollIntoView for components that use scrolling
Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
  writable: true,
  value: vi.fn(),
})

// Mock environment variables for testing
vi.mock('import.meta', () => ({
  env: {
    VITE_SUPABASE_URL: 'http://localhost:54321',
    VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    VITE_API_BASE_URL: 'http://localhost:3000',
    VITE_BASE_URL: 'http://localhost:5173',
  },
}))

// Mock the logger to use no-op functions to reduce test noise
vi.mock('./src/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

// Console suppression for cleaner test output
const originalConsole = { ...console }

beforeAll(() => {
  // Suppress all console output during tests unless debugging
  if (process.env.NODE_ENV === 'test' && !process.env.VITEST_DEBUG) {
    // eslint-disable-next-line no-console
    console.log = vi.fn()
    // eslint-disable-next-line no-console
    console.debug = vi.fn()
    // eslint-disable-next-line no-console
    console.info = vi.fn()
    // eslint-disable-next-line no-console
    console.warn = vi.fn()
    // eslint-disable-next-line no-console
    console.error = vi.fn()
  } else {
    // Only filter specific warnings when not in debug mode
    // eslint-disable-next-line no-console, @typescript-eslint/no-explicit-any
    console.error = (...args: any[]) => {
      // Filter out React warning messages that are noise in tests
      if (
        typeof args[0] === 'string' &&
        (args[0].includes('Warning: ReactDOM.render is deprecated') ||
         args[0].includes('Warning: React.createFactory is deprecated') ||
         args[0].includes('Warning: componentWillReceiveProps has been renamed'))
      ) {
        return
      }
      originalConsole.error.call(console, ...args)
    }

    // eslint-disable-next-line no-console
    console.warn = (...args: any[]) => {
      // Filter out warning messages that are noise in tests
      if (
        typeof args[0] === 'string' &&
        args[0].includes('React Router Future Flag Warning')
      ) {
        return
      }
      originalConsole.warn.call(console, ...args)
    }
  }
})

afterAll(() => {
  // Restore original console methods
  // eslint-disable-next-line no-console
  console.log = originalConsole.log
  // eslint-disable-next-line no-console
  console.debug = originalConsole.debug
  // eslint-disable-next-line no-console
  console.info = originalConsole.info
  // eslint-disable-next-line no-console
  console.warn = originalConsole.warn
  // eslint-disable-next-line no-console
  console.error = originalConsole.error
})

// Global test cleanup
afterEach(() => {
  // Clear all mocks after each test
  vi.clearAllMocks()
  
  // Clean up any timers that might still be running
  vi.clearAllTimers()
  
  // Reset modules to ensure clean state between tests
  vi.resetModules()
}) 