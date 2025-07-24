/**
 * OPML Upload Route
 * 
 * Handles OPML file uploads for authenticated users to import podcast subscriptions.
 * - Accepts multipart/form-data with OPML XML file
 * - Parses OPML to extract podcast RSS feeds
 * - Creates podcast shows and user subscriptions
 * - Returns number of successfully imported shows
 */

import express, { Router, Request, Response } from 'express';
import multer from 'multer';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database, ApiResponse } from '@listener/shared';
import { OPMLParserService } from '../services/opmlParserService.js';

// Create router
const router: Router = express.Router();

// Configure multer for memory storage with 5MB limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept XML and OPML files
    const allowedMimeTypes = [
      'text/xml',
      'application/xml',
      'text/x-opml',
      'application/octet-stream' // Some browsers send this for .opml files
    ];
    
    if (allowedMimeTypes.includes(file.mimetype) || 
        file.originalname.toLowerCase().endsWith('.opml') ||
        file.originalname.toLowerCase().endsWith('.xml')) {
      cb(null, true);
    } else {
      cb(new Error('Only XML/OPML files are allowed'));
    }
  }
});

// Supabase client initialization
let supabaseAdmin: SupabaseClient<Database> | null = null;

function getSupabaseAdmin(): SupabaseClient<Database> {
  if (!supabaseAdmin) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing required environment variables for Supabase');
    }
    supabaseAdmin = createClient<Database>(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabaseAdmin;
}

// Export for testing purposes only
export const _testUtils = {
  resetSupabaseClient: () => {
    if (process.env.NODE_ENV === 'test') {
      supabaseAdmin = null;
    }
  },
  getSupabaseClientState: () => {
    return { isInitialized: supabaseAdmin !== null };
  }
};

// Response interfaces
interface OPMLUploadResponse extends ApiResponse {
  data?: {
    totalImported: number;
    totalInFile: number;
    validFeeds: number;
    shows: Array<{
      title: string;
      rssUrl: string;
      imported: boolean;
      error?: string;
    }>;
  };
}

/**
 * POST /api/opml-upload
 * Upload and process an OPML file
 */
router.post('/', upload.single('opmlFile'), async (req: Request, res: Response<OPMLUploadResponse>): Promise<void> => {
  try {
    console.log('[OPML_UPLOAD] Starting OPML upload processing');
    
    // Validate file was uploaded
    if (!req.file) {
      res.status(400).json({
        success: false,
        error: 'No file uploaded. Please select an OPML file.'
      });
      return;
    }

    // Extract auth token from request
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : 
                  req.cookies?.['auth-token'];

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Authentication required. Please log in.'
      });
      return;
    }

    // Validate user authentication
    const supabase = getSupabaseAdmin();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('[OPML_UPLOAD] Auth error:', authError);
      res.status(401).json({
        success: false,
        error: 'Invalid authentication token. Please log in again.'
      });
      return;
    }

    console.log(`[OPML_UPLOAD] Processing upload for user: ${user.id}`);

    // Parse OPML file
    const opmlContent = req.file.buffer.toString('utf-8');
    const parser = new OPMLParserService();
    const parseResult = await parser.parseOPML(opmlContent);

    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: parseResult.error || 'Failed to parse OPML file'
      });
      return;
    }

    console.log(`[OPML_UPLOAD] Parsed ${parseResult.totalCount} podcasts, ${parseResult.validCount} valid`);

    // Process each podcast
    const importResults = [];
    let successCount = 0;

    for (const podcast of parseResult.podcasts) {
      try {
        // Skip invalid RSS feeds
        if (!podcast.isValid) {
          importResults.push({
            title: podcast.title,
            rssUrl: podcast.rssUrl,
            imported: false,
            error: podcast.validationError || 'Invalid RSS feed'
          });
          continue;
        }

        // Check if show already exists by RSS URL
        const { data: existingShow, error: showCheckError } = await supabase
          .from('podcast_shows')
          .select('id, title')
          .eq('rss_url', podcast.rssUrl)
          .single();

        if (showCheckError && showCheckError.code !== 'PGRST116') { // PGRST116 = not found
          console.error(`[OPML_UPLOAD] Error checking show existence:`, showCheckError);
          throw showCheckError;
        }

        let showId: string;
        let showTitle: string;

        if (existingShow) {
          // Show already exists, use existing ID
          showId = existingShow.id;
          showTitle = existingShow.title;
          console.log(`[OPML_UPLOAD] Show already exists: ${showTitle} (${showId})`);
        } else {
          // Create new show
          const { data: newShow, error: createError } = await supabase
            .from('podcast_shows')
            .insert({
              title: podcast.title,
              rss_url: podcast.rssUrl,
              spotify_url: null, // No Spotify URL for OPML imports
              description: null,
              image_url: null,
              etag: null,
              last_modified: null,
              last_fetched: null,
              last_checked_episodes: null
            })
            .select('id')
            .single();

          if (createError) {
            console.error(`[OPML_UPLOAD] Error creating show:`, createError);
            throw createError;
          }

          showId = newShow.id;
          showTitle = podcast.title;
          console.log(`[OPML_UPLOAD] Created new show: ${showTitle} (${showId})`);
        }

        // Check if user already has subscription
        const { data: existingSub, error: subCheckError } = await supabase
          .from('user_podcast_subscriptions')
          .select('id, status')
          .eq('user_id', user.id)
          .eq('show_id', showId)
          .single();

        if (subCheckError && subCheckError.code !== 'PGRST116') {
          console.error(`[OPML_UPLOAD] Error checking subscription:`, subCheckError);
          throw subCheckError;
        }

        if (existingSub) {
          // Update existing subscription to active
          if (existingSub.status !== 'active') {
            const { error: updateError } = await supabase
              .from('user_podcast_subscriptions')
              .update({ 
                status: 'active',
                subscription_source: 'opml',
                updated_at: new Date().toISOString()
              })
              .eq('id', existingSub.id);

            if (updateError) {
              console.error(`[OPML_UPLOAD] Error updating subscription:`, updateError);
              throw updateError;
            }
            console.log(`[OPML_UPLOAD] Reactivated subscription for ${showTitle}`);
          }
        } else {
          // Create new subscription
          const { error: insertError } = await supabase
            .from('user_podcast_subscriptions')
            .insert({
              user_id: user.id,
              show_id: showId,
              status: 'active',
              subscription_source: 'opml'
            });

          if (insertError) {
            console.error(`[OPML_UPLOAD] Error creating subscription:`, insertError);
            throw insertError;
          }
          console.log(`[OPML_UPLOAD] Created subscription for ${showTitle}`);
        }

        successCount++;
        importResults.push({
          title: showTitle,
          rssUrl: podcast.rssUrl,
          imported: true
        });

      } catch (error) {
        console.error(`[OPML_UPLOAD] Error importing podcast ${podcast.title}:`, error);
        importResults.push({
          title: podcast.title,
          rssUrl: podcast.rssUrl,
          imported: false,
          error: error instanceof Error ? error.message : 'Import failed'
        });
      }
    }

    console.log(`[OPML_UPLOAD] Import complete. ${successCount}/${parseResult.totalCount} shows imported`);

    res.status(200).json({
      success: true,
      data: {
        totalImported: successCount,
        totalInFile: parseResult.totalCount,
        validFeeds: parseResult.validCount,
        shows: importResults
      }
    });

  } catch (error) {
    console.error('[OPML_UPLOAD] Unexpected error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process OPML file'
    });
  }
});

export default router;