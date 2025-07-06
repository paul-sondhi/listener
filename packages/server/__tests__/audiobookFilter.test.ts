import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shouldSkipAudiobook, getAudiobookSkipListCount } from '../lib/audiobookFilter.js';
import { readFileSync } from 'fs';

// Mock the file system read
vi.mock('fs', () => ({
  readFileSync: vi.fn()
}));

// Mock the path join
vi.mock('path', () => ({
  join: vi.fn(() => '/mock/path/config/audiobook-skip-list.json')
}));

describe('Audiobook Filter', () => {
  const mockReadFileSync = vi.mocked(readFileSync);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('shouldSkipAudiobook', () => {
    it('should return true for show ID in skip list', () => {
      const mockConfig = {
        skipShowIds: ['279JRLPYDjvmsS81C7SOzg', 'another-show-id']
      };
      
      mockReadFileSync.mockReturnValue(JSON.stringify(mockConfig));
      
      expect(shouldSkipAudiobook('279JRLPYDjvmsS81C7SOzg')).toBe(true);
    });

    it('should return false for show ID not in skip list', () => {
      const mockConfig = {
        skipShowIds: ['279JRLPYDjvmsS81C7SOzg']
      };
      
      mockReadFileSync.mockReturnValue(JSON.stringify(mockConfig));
      
      expect(shouldSkipAudiobook('different-show-id')).toBe(false);
    });

    it('should return false when config file cannot be read', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });
      
      expect(shouldSkipAudiobook('any-show-id')).toBe(false);
    });

    it('should return false when config file has invalid JSON', () => {
      mockReadFileSync.mockReturnValue('invalid json');
      
      expect(shouldSkipAudiobook('any-show-id')).toBe(false);
    });
  });

  describe('getAudiobookSkipListCount', () => {
    it('should return correct count of shows in skip list', () => {
      const mockConfig = {
        skipShowIds: ['show1', 'show2', 'show3']
      };
      
      mockReadFileSync.mockReturnValue(JSON.stringify(mockConfig));
      
      expect(getAudiobookSkipListCount()).toBe(3);
    });

    it('should return 0 when skip list is empty', () => {
      const mockConfig = {
        skipShowIds: []
      };
      
      mockReadFileSync.mockReturnValue(JSON.stringify(mockConfig));
      
      expect(getAudiobookSkipListCount()).toBe(0);
    });

    it('should return 0 when config file cannot be read', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });
      
      expect(getAudiobookSkipListCount()).toBe(0);
    });
  });
}); 