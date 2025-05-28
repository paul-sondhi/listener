import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';

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
        // Get the current session
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error('Error getting session:', error);
          return;
        }
        if (!session) {
          console.warn('No session found');
          return;
        }

        // Extract Spotify tokens from the session
        const accessToken = session.provider_token;
        const refreshToken = session.provider_refresh_token;
        const expiresAt = session.expires_at;
        const supabaseAccessToken = session?.access_token;

        // Only proceed if we have all required tokens
        if (accessToken && refreshToken && expiresAt) {
          // Store tokens in backend
          const storeResponse = await fetch('/api/store-spotify-tokens', {
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

          // Sync Spotify shows
          const syncResponse = await fetch('/api/sync-spotify-shows', {
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
        console.error('Error syncing Spotify tokens:', err);
        setError(err.message);
      }
    };

    syncSpotifyTokens();
  }, []); // Empty dependency array means this runs once on mount

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        '/api/transcribe?url=' + encodeURIComponent(spotifyUrl)
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