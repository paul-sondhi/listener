import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TranscriptService } from './TranscriptService.js';
import { EpisodeWithShow } from '../../../shared/src/types/supabase.js';

// Mock data for testing
const createMockEpisode = (overrides: Partial<EpisodeWithShow> = {}): EpisodeWithShow => ({
  id: 'test-episode-id',
  show_id: 'test-show-id',
  guid: 'test-guid',
  episode_url: 'https://example.com/episode.mp3',
  title: 'Test Episode',
  description: 'An episode for testing.',
  pub_date: new Date().toISOString(),
  duration_sec: 1800,
  created_at: new Date().toISOString(),
  deleted_at: undefined,
  show: {
    rss_url: 'https://example.com/feed.xml',
  },
  ...overrides,
});

describe('TranscriptService', () => {
  let transcriptService: TranscriptService;

  beforeEach(() => {
    transcriptService = new TranscriptService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getTranscript by ID', () => {
    it('should call fetchEpisodeById and delegate to the other overload', async () => {
      const episodeId = 'test-episode-id';
      const mockEpisode = createMockEpisode({ id: episodeId });

      // Spy on the private fetch method and the public getTranscript method
      const fetchSpy = vi.spyOn(transcriptService as any, 'fetchEpisodeById').mockResolvedValue(mockEpisode);
      const getTranscriptSpy = vi.spyOn(transcriptService, 'getTranscript');

      await transcriptService.getTranscript(episodeId);

      expect(fetchSpy).toHaveBeenCalledWith(episodeId);
      // The public method is called twice: once with the ID, once with the episode object
      expect(getTranscriptSpy).toHaveBeenCalledTimes(2); 
      expect(getTranscriptSpy).toHaveBeenCalledWith(episodeId);
      expect(getTranscriptSpy).toHaveBeenCalledWith(mockEpisode);
    });
  });

  describe('getTranscript with an episode object', () => {
    it('should return not_found for a valid, eligible episode when no Taddy client is available', async () => {
      const mockEpisode = createMockEpisode();
      const result = await transcriptService.getTranscript(mockEpisode);
      expect(result).toEqual({ kind: 'not_found' });
    });

    it('should return error for an episode with a null rss_url', async () => {
      const mockEpisode = createMockEpisode({ show: { rss_url: null } });
      const result = await transcriptService.getTranscript(mockEpisode);
      expect(result).toEqual({ 
        kind: 'error', 
        message: 'Episode is not eligible for transcript processing' 
      });
    });

    it('should return error for an episode with an empty rss_url', async () => {
      const mockEpisode = createMockEpisode({ show: { rss_url: '' } });
      const result = await transcriptService.getTranscript(mockEpisode);
      expect(result).toEqual({ 
        kind: 'error', 
        message: 'Episode is not eligible for transcript processing' 
      });
    });

    it('should return error for an episode with a whitespace-only rss_url', async () => {
      const mockEpisode = createMockEpisode({ show: { rss_url: '   ' } });
      const result = await transcriptService.getTranscript(mockEpisode);
      expect(result).toEqual({ 
        kind: 'error', 
        message: 'Episode is not eligible for transcript processing' 
      });
    });

    it('should return error for an episode with a deleted_at timestamp', async () => {
      const mockEpisode = createMockEpisode({ deleted_at: new Date().toISOString() });
      const result = await transcriptService.getTranscript(mockEpisode);
      expect(result).toEqual({ 
        kind: 'error', 
        message: 'Episode is not eligible for transcript processing' 
      });
    });
  });

  it('should be defined', () => {
    expect(transcriptService).toBeDefined();
  });
}); 