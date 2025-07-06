import { readFileSync } from 'fs';
import { join } from 'path';

interface AudiobookSkipList {
  description: string;
  lastUpdated: string;
  skipShowIds: string[];
  notes: string[];
}

/**
 * Load the audiobook skip list from the config file
 * @returns Array of Spotify show IDs to skip
 */
export function loadAudiobookSkipList(): string[] {
  try {
    // Path to the config file (relative to project root)
    const configPath = join(process.cwd(), 'config', 'audiobook-skip-list.json');
    const configData = readFileSync(configPath, 'utf8');
    const config: AudiobookSkipList = JSON.parse(configData);
    
    return config.skipShowIds || [];
  } catch (error) {
    console.warn('Failed to load audiobook skip list:', error instanceof Error ? error.message : 'Unknown error');
    return [];
  }
}

/**
 * Check if a Spotify show ID should be skipped (is an audiobook)
 * @param showId - The Spotify show ID to check
 * @returns True if the show should be skipped
 */
export function shouldSkipAudiobook(showId: string): boolean {
  const skipList = loadAudiobookSkipList();
  return skipList.includes(showId);
}

/**
 * Get the count of shows in the skip list
 * @returns Number of shows in the skip list
 */
export function getAudiobookSkipListCount(): number {
  const skipList = loadAudiobookSkipList();
  return skipList.length;
} 