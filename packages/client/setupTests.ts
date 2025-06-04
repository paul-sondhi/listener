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
  interface ViJestAssertion<_T = any> {
    toBeInTheDocument(): void
    toHaveAttribute(attr: string, value?: string): void
    toHaveClass(className: string): void
    toHaveStyle(style: string | Record<string, any>): void
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

// Console warning/error filtering for cleaner test output
const originalError = console.error
const originalWarn = console.warn

beforeAll(() => {
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
    originalError.call(console, ...args)
  }

  console.warn = (...args: any[]) => {
    // Filter out warning messages that are noise in tests
    if (
      typeof args[0] === 'string' &&
      args[0].includes('React Router Future Flag Warning')
    ) {
      return
    }
    originalWarn.call(console, ...args)
  }
})

afterAll(() => {
  console.error = originalError
  console.warn = originalWarn
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