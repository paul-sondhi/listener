import { useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { logger } from '../lib/logger'

// Get the API base URL from environment variables
const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL || ''

// Interface for upload response
interface OPMLUploadResponse {
  success: boolean
  error?: string
  data?: {
    totalImported: number
    totalInFile: number
    validFeeds: number
    shows: Array<{
      title: string
      rssUrl: string
      imported: boolean
      error?: string
    }>
  }
}

/**
 * OPML Upload Component
 * Handles OPML file uploads for Google OAuth users to import podcast subscriptions
 */
export default function OPMLUpload(): React.JSX.Element {
  const [isUploading, setIsUploading] = useState<boolean>(false)
  const [uploadResult, setUploadResult] = useState<OPMLUploadResponse | null>(null)
  const [error, setError] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  /**
   * Handle file selection and upload
   */
  const handleFileUpload = useCallback(async (file: File): Promise<void> => {
    try {
      setError('')
      setUploadResult(null)
      setIsUploading(true)

      // Validate file type
      if (!file.name.toLowerCase().endsWith('.opml') && !file.name.toLowerCase().endsWith('.xml')) {
        setError('Please select an OPML or XML file.')
        return
      }

      // Validate file size (5MB limit)
      if (file.size > 5 * 1024 * 1024) {
        setError('File size must be less than 5MB.')
        return
      }

      // Get authentication token
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session) {
        setError('Authentication required. Please log in again.')
        return
      }

      // Create form data
      const formData = new FormData()
      formData.append('opmlFile', file)

      logger.info('Uploading OPML file:', file.name)

      // Upload file
      const response = await fetch(`${API_BASE_URL}/api/opml-upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        },
        body: formData
      })

      const result: OPMLUploadResponse = await response.json()

      if (!response.ok) {
        setError(result.error || 'Failed to upload OPML file')
        return
      }

      setUploadResult(result)
      logger.info('OPML upload successful:', result)

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred'
      logger.error('OPML upload error:', errorMessage)
      setError('Failed to upload file. Please try again.')
    } finally {
      setIsUploading(false)
    }
  }, [])


  /**
   * Handle file input change
   */
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
    const files = e.target.files
    if (files && files.length > 0 && files[0]) {
      void handleFileUpload(files[0])
    }
  }, [handleFileUpload])

  /**
   * Handle click to select file
   */
  const handleSelectFile = useCallback((): void => {
    fileInputRef.current?.click()
  }, [])

  /**
   * Reset upload state for new upload
   */
  const handleNewUpload = useCallback((): void => {
    setUploadResult(null)
    setError('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  return (
    <div className="opml-upload">
      {!uploadResult && !error && (
        <div className="opml-upload-button-container">
          <input
            ref={fileInputRef}
            type="file"
            accept=".opml,.xml"
            onChange={handleFileInputChange}
            style={{ display: 'none' }}
            disabled={isUploading}
          />
          
          <span
            onClick={isUploading ? undefined : handleSelectFile}
            className={`action-link ${isUploading ? 'disabled' : ''}`}
            role="button"
            tabIndex={isUploading ? -1 : 0}
          >
            {isUploading ? 'Processing...' : 'Import OPML file'}
          </span>
        </div>
      )}

      {error && (
        <div className="upload-error" role="alert">
          <h3>Upload Failed</h3>
          <p>{error}</p>
          <button 
            onClick={handleNewUpload}
            className="retry-btn"
            type="button"
          >
            Try Again
          </button>
        </div>
      )}

      {uploadResult && uploadResult.success && uploadResult.data && (
        <div className="upload-success">
          <h3>Import Successful! 🎉</h3>
          <div className="import-summary">
            <p>
              <strong>{uploadResult.data.totalImported}</strong> of <strong>{uploadResult.data.totalInFile}</strong> podcasts imported
            </p>
            {uploadResult.data.validFeeds < uploadResult.data.totalInFile && (
              <p className="validation-note">
                ({uploadResult.data.totalInFile - uploadResult.data.validFeeds} feeds were invalid and skipped)
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}