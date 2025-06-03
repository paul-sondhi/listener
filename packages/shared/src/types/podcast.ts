// Podcast and episode types

import { BaseEntity } from './common.js';

// Podcast show information
export interface PodcastShow extends BaseEntity {
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
}

// Podcast episode information
export interface PodcastEpisode extends BaseEntity {
  id: string;
  show_id: string;
  title: string;
  description: string;
  audio_url: string;
  duration: number; // in seconds
  published_at: string;
  episode_number?: number;
  season_number?: number;
  image_url?: string;
  file_size?: number; // in bytes
  mime_type?: string;
  transcript?: string;
  transcript_confidence?: number;
  created_at: string;
  updated_at: string;
}

// Episode with show information
export interface EpisodeWithShow extends PodcastEpisode {
  show: PodcastShow;
}

// RSS feed item structure
export interface RssFeedItem {
  title: string;
  description: string;
  pubDate: string;
  enclosure: {
    url: string;
    type: string;
    length?: string;
  };
  guid: string;
  duration?: string;
  explicit?: boolean;
  episode?: number;
  season?: number;
  image?: string;
}

// RSS feed structure
export interface RssFeed {
  title: string;
  description: string;
  language: string;
  author: string;
  image?: string;
  link?: string;
  lastBuildDate?: string;
  categories: string[];
  explicit: boolean;
  items: RssFeedItem[];
}

// Transcription job status
export type TranscriptionStatus = 'pending' | 'processing' | 'completed' | 'failed';

// Transcription job
export interface TranscriptionJob extends BaseEntity {
  id: string;
  episode_id: string;
  status: TranscriptionStatus;
  progress: number; // 0-100
  transcript?: string;
  confidence?: number;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

// Search filters for episodes
export interface EpisodeSearchFilters {
  showId?: string;
  query?: string;
  dateFrom?: string;
  dateTo?: string;
  hasTranscript?: boolean;
  duration?: {
    min?: number;
    max?: number;
  };
} 