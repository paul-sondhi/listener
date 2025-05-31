import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';

// Get the API base URL from environment variables
// Default to an empty string for relative paths if not set (for local development)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

/**
 * AppPage Component
 * Main application page that handles podcast transcript downloads
 * and Spotify token synchronization
 */
const AppPage = () => {
  const { user } = useAuth();
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Sync Spotify tokens on component mount
  useEffect(() => {
    const syncSpotifyTokens = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          console.error('Error getting session:', sessionError);
          setError(sessionError.message);
          return;
        }
        if (!session) {
          console.warn('No session found');
          return;
        }

        const accessToken = session.provider_token;
        const refreshToken = session.provider_refresh_token;
        const expiresAt = session.expires_at;
        const supabaseAccessToken = session?.access_token;

        if (accessToken && refreshToken && expiresAt) {
          const storeResponse = await fetch(`${API_BASE_URL}/api/store-spotify-tokens`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseAccessToken}`
            },
            body: JSON.stringify({
              access_token: accessToken,
              refresh_token: refreshToken,
              expires_at: expiresAt
            })
          });

          if (!storeResponse.ok) {
            throw new Error('Failed to store Spotify tokens');
          }

          const syncResponse = await fetch(`${API_BASE_URL}/api/sync-spotify-shows`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseAccessToken}`
            }
          });

          if (!syncResponse.ok) {
            const errorData = await syncResponse.json();
            throw new Error(errorData.error || 'Failed to sync Spotify shows');
          }

          const result = await syncResponse.json();
          console.log('Successfully synced Spotify shows:', result);
        } else {
          console.warn('Missing one or more Spotify tokens:', { accessToken, refreshToken, expiresAt });
        }
      } catch (err) {
        console.error('Error syncing Spotify tokens or subsequent operations:', err);
        setError(err.message);
      }
    };

    syncSpotifyTokens();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    // Trim whitespace and remove leading/trailing quotes or apostrophes from the URL
    let cleanSpotifyUrl = spotifyUrl.trim();
    // Specifically remove the leading modifier letter turned comma if present
    if (cleanSpotifyUrl.startsWith('ʻ')) {
      cleanSpotifyUrl = cleanSpotifyUrl.substring(1);
    }
    // Remove leading/trailing standard single or double quotes
    if ((cleanSpotifyUrl.startsWith("'") && cleanSpotifyUrl.endsWith("'")) || 
        (cleanSpotifyUrl.startsWith('"') && cleanSpotifyUrl.endsWith('"'))) {
      cleanSpotifyUrl = cleanSpotifyUrl.substring(1, cleanSpotifyUrl.length - 1);
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/transcribe?url=${encodeURIComponent(cleanSpotifyUrl)}`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || response.status);
      }

      // Parse transcript text and trigger download
      const transcript = await response.text();
      const blob = new Blob([transcript], { type: 'text/plain' });
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = 'transcript.txt';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(downloadUrl);

      // Clear the input after successful download
      setSpotifyUrl('');
    } catch (err) {
      console.error('Download error:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container">
      <h1>Podcast Transcript Downloader</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="url"
          value={spotifyUrl}
          onChange={(e) => setSpotifyUrl(e.target.value)}
          placeholder="Enter Spotify show URL"
          required
        />
        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Downloading...' : 'Download Episode'}
        </button>
      </form>
      {error && <div className="error">{error}</div>}
    </div>
  );
};

export default AppPage; 