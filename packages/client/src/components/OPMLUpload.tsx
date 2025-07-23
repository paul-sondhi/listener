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
  const [isDragOver, setIsDragOver] = useState<boolean>(false)
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
   * Handle drag and drop events
   */
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    setIsDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      void handleFileUpload(files[0])
    }
  }, [handleFileUpload])

  /**
   * Handle file input change
   */
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
    const files = e.target.files
    if (files && files.length > 0) {
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
      <h2>Import Additional Podcasts from OPML</h2>
      <p>Upload an OPML file from your podcast app to import additional podcast subscriptions.</p>

      {!uploadResult && !error && (
        <div
          className={`upload-zone ${isDragOver ? 'drag-over' : ''} ${isUploading ? 'uploading' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleSelectFile}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handleSelectFile()
            }
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".opml,.xml"
            onChange={handleFileInputChange}
            style={{ display: 'none' }}
            disabled={isUploading}
          />
          
          {isUploading ? (
            <div className="upload-progress">
              <div className="spinner"></div>
              <p>Processing OPML file...</p>
            </div>
          ) : (
            <div className="upload-prompt">
              <div className="upload-icon">📁</div>
              <p><strong>Click to select</strong> or drag and drop your OPML file here</p>
              <p className="file-info">Supports .opml and .xml files (max 5MB)</p>
            </div>
          )}
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

          <div className="imported-shows">
            <h4>Imported Podcasts:</h4>
            <ul className="shows-list">
              {uploadResult.data.shows.map((show, index) => (
                <li key={index} className={`show-item ${show.imported ? 'imported' : 'failed'}`}>
                  <div className="show-info">
                    <span className="show-title">{show.title}</span>
                    {show.imported ? (
                      <span className="import-status success">✓ Imported</span>
                    ) : (
                      <div className="import-status failed">
                        <span>✗ Failed</span>
                        {show.error && <span className="error-reason">: {show.error}</span>}
                      </div>
                    )}
                  </div>
                  <div className="show-url">{show.rssUrl}</div>
                </li>
              ))}
            </ul>
          </div>

          <div className="next-steps">
            <h4>What's Next?</h4>
            <p>Your imported podcasts will be included in your daily newsletter. Look out for an email from Listener every day at 12p ET / 9a PT with summaries from your subscribed shows.</p>
          </div>

          <button 
            onClick={handleNewUpload}
            className="new-upload-btn"
            type="button"
          >
            Import Another OPML File
          </button>
        </div>
      )}
    </div>
  )
}