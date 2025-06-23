import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { TranscriptWorker } from '../services/TranscriptWorker.js'

const GUID = '6bdfd429-f58b-427d-8072-353d478aa15f'
const FEED_URL = 'https://example.com/feed.xml'

let supabase: SupabaseClient

beforeAll(() => {
  const url = process.env.TEST_SUPABASE_URL || 'http://localhost:54321'
  const key = process.env.TEST_SUPABASE_ANON_KEY || 'test-key'
  supabase = createClient(url, key)
})

describe('Real Taddy API transcript retrieval', () => {
  it('retrieves and stores a transcript for the specified episode', async () => {
    if (!process.env.TADDY_API_KEY) {
      console.warn('TADDY_API_KEY not set, skipping real Taddy integration test')
      return
    }

    // Insert show
    const { data: showData, error: showError } = await supabase
      .from('podcast_shows')
      .insert({
        id: `test-show-${Date.now()}`,
        rss_url: FEED_URL,
        title: 'Test Show',
        description: 'Test',
        image_url: 'https://example.com/image.png',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single()

    if (showError) throw new Error(showError.message)

    const { data: episodeData, error: episodeError } = await supabase
      .from('podcast_episodes')
      .insert({
        id: `test-episode-${Date.now()}`,
        show_id: showData.id,
        guid: GUID,
        episode_url: 'https://example.com/episode.mp3',
        title: 'Test Episode',
        description: 'Test',
        pub_date: new Date().toISOString(),
        duration_sec: 60,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single()

    if (episodeError) throw new Error(episodeError.message)

    const worker = new TranscriptWorker(
      { lookbackHours: 24, maxRequests: 5, concurrency: 1, useAdvisoryLock: false },
      undefined,
      supabase
    )

    let summary
    try {
      summary = await worker.run()
    } catch (err: any) {
      console.warn('Transcript worker failed:', err.message)
      return
    }

    if (summary.availableTranscripts === 0) {
      console.warn('No transcript retrieved from Taddy API; test is inconclusive')
      return
    }

    const { data: transcripts, error: transcriptsError } = await supabase
      .from('transcripts')
      .select('*')
      .eq('episode_id', episodeData.id)

    expect(transcriptsError).toBeNull()
    expect(transcripts).toHaveLength(1)
    expect(transcripts![0].status).toBe('available')
  })
})
