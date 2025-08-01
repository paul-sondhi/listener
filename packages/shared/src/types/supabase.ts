// Supabase database schema types

// Database table names
export type TableName = 
  | 'users'
  | 'podcast_shows'
  | 'podcast_episodes' 
  | 'transcription_jobs'
  | 'spotify_tokens'
  | 'user_subscriptions';

// Database row types
export interface DatabaseTables {
  users: {
    Row: {
      id: string;
      email: string;
      created_at: string;
      updated_at: string;
      email_confirmed_at?: string;
      last_sign_in_at?: string;
      app_metadata?: Record<string, unknown>;
      user_metadata?: Record<string, unknown>;
    };
    Insert: {
      id?: string;
      email: string;
      created_at?: string;
      updated_at?: string;
      email_confirmed_at?: string;
      last_sign_in_at?: string;
      app_metadata?: Record<string, unknown>;
      user_metadata?: Record<string, unknown>;
    };
    Update: {
      id?: string;
      email?: string;
      created_at?: string;
      updated_at?: string;
      email_confirmed_at?: string;
      last_sign_in_at?: string;
      app_metadata?: Record<string, unknown>;
      user_metadata?: Record<string, unknown>;
    };
  };

  podcast_shows: {
    Row: {
      id: string;
      title: string;
      description: string;
      author: string;
      language: string;
      image_url?: string;
      feed_url: string;
      website_url?: string;
      total_episodes: number;
      last_updated: string;
      categories: string[];
      explicit: boolean;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      title: string;
      description: string;
      author: string;
      language: string;
      image_url?: string;
      feed_url: string;
      website_url?: string;
      total_episodes?: number;
      last_updated?: string;
      categories?: string[];
      explicit?: boolean;
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      title?: string;
      description?: string;
      author?: string;
      language?: string;
      image_url?: string;
      feed_url?: string;
      website_url?: string;
      total_episodes?: number;
      last_updated?: string;
      categories?: string[];
      explicit?: boolean;
      created_at?: string;
      updated_at?: string;
    };
  };

  podcast_episodes: {
    Row: {
      id: string;
      show_id: string;
      guid: string;
      episode_url: string;
      title?: string;
      description?: string;
      pub_date?: string;
      duration_sec?: number;
      created_at: string;
      deleted_at?: string; // Add soft delete support for future use
    };
    Insert: {
      id?: string;
      show_id: string;
      guid: string;
      episode_url: string;
      title?: string;
      description?: string;
      pub_date?: string;
      duration_sec?: number;
      created_at?: string;
      deleted_at?: string;
    };
    Update: {
      id?: string;
      show_id?: string;
      guid?: string;
      episode_url?: string;
      title?: string;
      description?: string;
      pub_date?: string;
      duration_sec?: number;
      created_at?: string;
      deleted_at?: string;
    };
  };

  transcription_jobs: {
    Row: {
      id: string;
      episode_id: string;
      status: 'pending' | 'processing' | 'completed' | 'failed';
      progress: number;
      transcript?: string;
      confidence?: number;
      error_message?: string;
      started_at?: string;
      completed_at?: string;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      episode_id: string;
      status?: 'pending' | 'processing' | 'completed' | 'failed';
      progress?: number;
      transcript?: string;
      confidence?: number;
      error_message?: string;
      started_at?: string;
      completed_at?: string;
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      episode_id?: string;
      status?: 'pending' | 'processing' | 'completed' | 'failed';
      progress?: number;
      transcript?: string;
      confidence?: number;
      error_message?: string;
      started_at?: string;
      completed_at?: string;
      created_at?: string;
      updated_at?: string;
    };
  };

  spotify_tokens: {
    Row: {
      id: string;
      user_id: string;
      access_token: string;
      refresh_token: string;
      expires_at: string;
      token_type: string;
      scope: string;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      user_id: string;
      access_token: string;
      refresh_token: string;
      expires_at: string;
      token_type?: string;
      scope: string;
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      user_id?: string;
      access_token?: string;
      refresh_token?: string;
      expires_at?: string;
      token_type?: string;
      scope?: string;
      created_at?: string;
      updated_at?: string;
    };
  };

  user_subscriptions: {
    Row: {
      id: string;
      user_id: string;
      show_id: string;
      subscribed_at: string;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      user_id: string;
      show_id: string;
      subscribed_at?: string;
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      user_id?: string;
      show_id?: string;
      subscribed_at?: string;
      created_at?: string;
      updated_at?: string;
    };
  };
}

// Helper type for any table row
export type DatabaseRow<T extends TableName> = DatabaseTables[T]['Row'];
export type DatabaseInsert<T extends TableName> = DatabaseTables[T]['Insert'];
export type DatabaseUpdate<T extends TableName> = DatabaseTables[T]['Update'];

// Supabase client type
export interface Database {
  public: {
    Tables: DatabaseTables;
  };
}

// Extended episode type with show information for transcript processing
export type EpisodeWithShow = DatabaseRow<'podcast_episodes'> & {
  show?: {
    rss_url?: string | null;
  };
}; 