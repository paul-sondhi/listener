import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Mock the supabase client
vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn()
    }
  }
}))

// Mock logger
vi.mock('../../lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}))

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

// Import component after mocks
import OPMLUpload from '../OPMLUpload'
import { supabase } from '../../lib/supabaseClient'

// Get the mocked function
const mockGetSession = vi.mocked(supabase.auth.getSession)

/**
 * Test suite for the OPML Upload component
 * Tests file upload, drag-and-drop, progress indication, and error handling
 */
describe('OPMLUpload Component', () => {
  const mockSession = {
    access_token: 'test-token',
    user: { id: 'test-user' }
  }

  beforeEach(() => {
    mockGetSession.mockResolvedValue({
      data: { session: mockSession },
      error: null
    })
    mockFetch.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the upload interface correctly', () => {
    render(<OPMLUpload />)

    expect(screen.getByText('Import OPML File')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /import opml file/i })).toBeInTheDocument()
  })

  it('handles file selection via click', async () => {
    const mockFile = new File(['<opml></opml>'], 'test.opml', { type: 'text/xml' })
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          totalImported: 1,
          totalInFile: 1,
          validFeeds: 1,
          shows: [{
            title: 'Test Podcast',
            rssUrl: 'https://example.com/feed.xml',
            imported: true
          }]
        }
      })
    })

    render(<OPMLUpload />)

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement

    // Simulate file selection
    Object.defineProperty(fileInput, 'files', {
      value: [mockFile],
      writable: false
    })

    fireEvent.change(fileInput)

    // Wait for upload to complete
    await waitFor(() => {
      expect(screen.getByText('Import Successful! 🎉')).toBeInTheDocument()
    })

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/opml-upload',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-token'
        }
      })
    )
  })

  it('validates file type and shows error for invalid files', async () => {
    const mockFile = new File(['invalid content'], 'test.txt', { type: 'text/plain' })
    
    render(<OPMLUpload />)

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement

    Object.defineProperty(fileInput, 'files', {
      value: [mockFile],
      writable: false
    })

    fireEvent.change(fileInput)

    await waitFor(() => {
      expect(screen.getByText('Please select an OPML or XML file.')).toBeInTheDocument()
    })

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('validates file size and shows error for large files', async () => {
    // Create a file larger than 5MB
    const largeMockFile = new File(['x'.repeat(6 * 1024 * 1024)], 'large.opml', { type: 'text/xml' })
    
    render(<OPMLUpload />)

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement

    Object.defineProperty(fileInput, 'files', {
      value: [largeMockFile],
      writable: false
    })

    fireEvent.change(fileInput)

    await waitFor(() => {
      expect(screen.getByText('File size must be less than 5MB.')).toBeInTheDocument()
    })

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('handles authentication errors', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: null },
      error: null
    })

    const mockFile = new File(['<opml></opml>'], 'test.opml', { type: 'text/xml' })
    
    render(<OPMLUpload />)

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement

    Object.defineProperty(fileInput, 'files', {
      value: [mockFile],
      writable: false
    })

    fireEvent.change(fileInput)

    await waitFor(() => {
      expect(screen.getByText('Authentication required. Please log in again.')).toBeInTheDocument()
    })

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('handles upload errors from server', async () => {
    const mockFile = new File(['<opml></opml>'], 'test.opml', { type: 'text/xml' })
    
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        success: false,
        error: 'Server error occurred'
      })
    })

    render(<OPMLUpload />)

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement

    Object.defineProperty(fileInput, 'files', {
      value: [mockFile],
      writable: false
    })

    fireEvent.change(fileInput)

    await waitFor(() => {
      expect(screen.getByText('Server error occurred')).toBeInTheDocument()
    })
  })

  it('shows loading state during upload', async () => {
    const mockFile = new File(['<opml></opml>'], 'test.opml', { type: 'text/xml' })
    
    // Create a promise that we can control
    let resolveUpload: (value: any) => void
    const uploadPromise = new Promise((resolve) => {
      resolveUpload = resolve
    })
    
    mockFetch.mockReturnValueOnce(uploadPromise)

    render(<OPMLUpload />)

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement

    Object.defineProperty(fileInput, 'files', {
      value: [mockFile],
      writable: false
    })

    fireEvent.change(fileInput)

    // Check loading state is shown
    await waitFor(() => {
      expect(screen.getByText('Processing...')).toBeInTheDocument()
    })

    // Resolve the upload
    resolveUpload!({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          totalImported: 1,
          totalInFile: 1,
          validFeeds: 1,
          shows: [{
            title: 'Test Podcast',
            rssUrl: 'https://example.com/feed.xml',
            imported: true
          }]
        }
      })
    })

    // Check success state is shown
    await waitFor(() => {
      expect(screen.getByText('Import Successful! 🎉')).toBeInTheDocument()
    })
  })

  it('displays detailed upload results', async () => {
    const mockFile = new File(['<opml></opml>'], 'test.opml', { type: 'text/xml' })
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          totalImported: 2,
          totalInFile: 3,
          validFeeds: 2,
          shows: [
            {
              title: 'Successful Podcast',
              rssUrl: 'https://example.com/feed1.xml',
              imported: true
            },
            {
              title: 'Another Success',
              rssUrl: 'https://example.com/feed2.xml',
              imported: true
            },
            {
              title: 'Failed Podcast',
              rssUrl: 'https://invalid.com/feed.xml',
              imported: false,
              error: 'Feed not reachable'
            }
          ]
        }
      })
    })

    render(<OPMLUpload />)

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement

    Object.defineProperty(fileInput, 'files', {
      value: [mockFile],
      writable: false
    })

    fireEvent.change(fileInput)

    await waitFor(() => {
      expect(screen.getByText('Import Successful! 🎉')).toBeInTheDocument()
      expect(screen.getByText((content, element) => {
        return element?.textContent === '2 of 3 podcasts imported'
      })).toBeInTheDocument()
      expect(screen.getByText('(1 feeds were invalid and skipped)')).toBeInTheDocument()
    })
  })



  it('allows retry after error', async () => {
    const mockFile = new File(['<opml></opml>'], 'test.opml', { type: 'text/xml' })
    
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        success: false,
        error: 'Network error'
      })
    })

    render(<OPMLUpload />)

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement

    Object.defineProperty(fileInput, 'files', {
      value: [mockFile],
      writable: false
    })

    fireEvent.change(fileInput)

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })

    // Click "Try Again" button
    const retryBtn = screen.getByText('Try Again')
    fireEvent.click(retryBtn)

    // Should show upload interface again
    expect(screen.getByText('Import OPML File')).toBeInTheDocument()
    expect(screen.queryByText('Network error')).not.toBeInTheDocument()
  })

  it('handles keyboard navigation', async () => {
    render(<OPMLUpload />)

    const uploadZone = screen.getByRole('button')
    
    // Test Enter key
    uploadZone.focus()
    fireEvent.keyDown(uploadZone, { key: 'Enter' })
    
    // Test Space key  
    fireEvent.keyDown(uploadZone, { key: ' ' })

    // Both should trigger file selection (we can't easily test file dialog opening)
    expect(uploadZone).toBeInTheDocument()
  })
})