import { BaseEntity } from './common.js';
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
export interface PodcastEpisode extends BaseEntity {
    id: string;
    show_id: string;
    title: string;
    description: string;
    audio_url: string;
    duration: number;
    published_at: string;
    episode_number?: number;
    season_number?: number;
    image_url?: string;
    file_size?: number;
    mime_type?: string;
    transcript?: string;
    transcript_confidence?: number;
    created_at: string;
    updated_at: string;
}
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
export type TranscriptionStatus = 'pending' | 'processing' | 'completed' | 'failed';
export interface TranscriptionJob extends BaseEntity {
    id: string;
    episode_id: string;
    status: TranscriptionStatus;
    progress: number;
    transcript?: string;
    confidence?: number;
    error_message?: string;
    started_at?: string;
    completed_at?: string;
    created_at: string;
    updated_at: string;
}
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
//# sourceMappingURL=podcast.d.ts.map