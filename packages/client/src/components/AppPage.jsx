import { useState, useEffect, useRef } from 'react';
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
  const { user, signOut } = useAuth();
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState(null);
  
  // Use ref to track if we've already synced for this user session
  const hasSynced = useRef(false);

  // Sync Spotify tokens on component mount
  useEffect(() => {
    const syncSpotifyTokens = async () => {
      // Prevent multiple simultaneous sync attempts or re-syncing for same user
      if (isSyncing || hasSynced.current) {
        console.log('Sync already in progress or completed, skipping...');
        return;
      }

      try {
        setIsSyncing(true);
        setError(null);
        
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          console.error('Error getting session:', sessionError);
          setError(sessionError.message);
          return;
        }
        if (!session) {
          console.warn('No session found - user needs to log in');
          return;
        }

        // Check if this is a Spotify OAuth session
        if (session.user?.app_metadata?.provider !== 'spotify') {
          console.warn('User not authenticated with Spotify');
          return;
        }

        const accessToken = session.provider_token;
        const refreshToken = session.provider_refresh_token;
        const expiresAt = session.expires_at;
        const supabaseAccessToken = session?.access_token;

        // Only proceed if we have all required tokens
        if (!accessToken || !refreshToken || !expiresAt) {
          console.warn('Missing Spotify tokens:', { 
            hasAccessToken: !!accessToken, 
            hasRefreshToken: !!refreshToken, 
            hasExpiresAt: !!expiresAt 
          });
          setError('Spotify authentication incomplete. Please log in again.');
          return;
        }

        console.log('Storing Spotify tokens...');
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
          const errorData = await storeResponse.json();
          throw new Error(errorData.error || 'Failed to store Spotify tokens');
        }

        console.log('Successfully stored tokens, now syncing shows...');
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
        
        // Mark as successfully synced for this session
        hasSynced.current = true;
      } catch (err) {
        console.error('Error syncing Spotify tokens or subsequent operations:', err);
        setError(`Authentication error: ${err.message}`);
      } finally {
        setIsSyncing(false);
      }
    };

    // Only try to sync if we have a user and we haven't synced yet
    if (user && !hasSynced.current) {
      syncSpotifyTokens();
    }
  }, [user]); // Remove isSyncing from dependencies to prevent infinite loop

  // Reset sync status when user changes (logout/login)
  useEffect(() => {
    if (!user) {
      hasSynced.current = false;
    }
  }, [user]);

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

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  return (
    <div className="container">
      <h1>Podcast Transcript Downloader</h1>
      {!user ? (
        <div className="login-prompt">
          <p>Please log in with Spotify to access the transcript downloader.</p>
          <p>Go back to the login page to authenticate with Spotify.</p>
        </div>
      ) : (
        <>
          <div className="user-info">
            <p>Welcome, {user.email}!</p>
            {isSyncing && <p className="syncing">Syncing Spotify data...</p>}
            <button onClick={handleLogout} className="logout-btn">Log out</button>
          </div>
          <form onSubmit={handleSubmit}>
            <input
              type="url"
              value={spotifyUrl}
              onChange={(e) => setSpotifyUrl(e.target.value)}
              placeholder="Enter Spotify show URL"
              required
              disabled={isSyncing}
            />
            <button type="submit" disabled={isLoading || isSyncing}>
              {isLoading ? 'Downloading...' : 'Download Episode'}
            </button>
          </form>
          {error && <div className="error">{error}</div>}
        </>
      )}
    </div>
  );
};

export default AppPage; 