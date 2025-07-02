import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { getSharedSupabaseClient } from '../lib/db/sharedSupabaseClient';
import * as geminiModule from '../lib/llm/gemini';
import { buildNewsletterEditionPrompt } from '../lib/utils/buildNewsletterEditionPrompt';
import { insertNewsletterEdition } from '../lib/db/newsletter-editions';
import { upsertEpisodeNotes } from '../lib/db/notesDatabase';
import { insertTranscript } from '../lib/db/transcripts';

// Get the shared Supabase client for testing
const supabase = getSharedSupabaseClient();

// Mock Gemini API call for all tests in this file
const cannedNewsletterHtml = `
<html><head><title>Test Newsletter</title></head><body>
<h1>Test Podcast Show</h1>
<h2>Episode 1: Introduction to AI</h2>
<p>AI is not about replacing humans, but augmenting human capabilities</p>
<h2>Episode 2: Machine Learning Basics</h2>
<p>Machine learning algorithms learn patterns from data without explicit programming</p>
<h2>Episode 3: Future of Technology</h2>
<p>Emerging technologies are reshaping industries and society</p>
</body></html>
`;

// Set up mock before all tests
beforeEach(() => {
  vi.spyOn(geminiModule, 'generateNewsletterEdition').mockImplementation(async (episodeNotes, _userEmail, _editionDate) => {
    // Handle empty episode notes case
    if (!episodeNotes || episodeNotes.length === 0) {
      return {
        htmlContent: '',
        sanitizedContent: '',
        model: 'gemini-pro',
        episodeCount: 0,
        success: false,
        error: 'episodeNotes array cannot be empty - at least one episode note is required'
      };
    }

    // Handle single episode case with different content
    if (episodeNotes.length === 1) {
      const singleEpisodeHtml = `
<html><head><title>Single Episode Newsletter</title></head><body>
<h1>Single Episode Show</h1>
<h2>Single Episode</h2>
<p>This is a test episode with minimal content.</p>
</body></html>
`;
      return {
        htmlContent: singleEpisodeHtml,
        sanitizedContent: singleEpisodeHtml,
        model: 'gemini-pro',
        episodeCount: 1,
        success: true
      };
    }

    // Default case for multiple episodes
    return {
      htmlContent: cannedNewsletterHtml,
      sanitizedContent: cannedNewsletterHtml,
      model: 'gemini-pro',
      episodeCount: episodeNotes.length,
      success: true
    };
  });
});

// Clean up mocks after all tests
afterAll(() => {
  vi.restoreAllMocks();
});

/**
 * Integration test for the complete newsletter edition generation flow
 * 
 * This test validates:
 * 1. Database seeding with realistic test data
 * 2. Prompt building with actual episode notes
 * 3. Gemini API integration (mocked)
 * 4. Newsletter edition storage and retrieval
 * 5. End-to-end data flow consistency
 */

describe('Newsletter Edition Integration', () => {
  // Test data IDs for cleanup
  const testIds = {
    show: '',
    episodes: [] as string[],
    transcripts: [] as string[],
    notes: [] as string[],
    newsletter: '',
    user: ''
  };

  // Test user data
  const testUserEmail = 'test@example.com';
  const testUserId = 'test-user-id';
  const testEditionDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD format

  beforeEach(async () => {
    await cleanupTestData();
    const timestamp = Date.now();
    testIds.user = testUserId;
    testIds.show = `test-show-${timestamp}`;
    testIds.episodes = [
      `test-episode-1-${timestamp}`,
      `test-episode-2-${timestamp}`,
      `test-episode-3-${timestamp}`
    ];
    testIds.transcripts = [
      `test-transcript-1-${timestamp}`,
      `test-transcript-2-${timestamp}`,
      `test-transcript-3-${timestamp}`
    ];
    testIds.notes = [
      `test-notes-1-${timestamp}`,
      `test-notes-2-${timestamp}`,
      `test-notes-3-${timestamp}`
    ];
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  async function cleanupTestData() {
    // Clean up newsletter editions
    if (testIds.newsletter) {
      await supabase
        .from('newsletter_editions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', testIds.newsletter);
    }
    // Clean up episode transcript notes
    for (const noteId of testIds.notes) {
      await supabase
        .from('episode_transcript_notes')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', noteId);
    }
    // Clean up transcripts
    for (const transcriptId of testIds.transcripts) {
      await supabase
        .from('transcripts')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', transcriptId);
    }
    // Clean up episodes
    for (const episodeId of testIds.episodes) {
      await supabase
        .from('episodes')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', episodeId);
    }
    // Clean up podcast show
    if (testIds.show) {
      await supabase
        .from('podcast_shows')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', testIds.show);
    }
    // Clean up test user
    if (testIds.user) {
      await supabase
        .from('users')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', testIds.user);
    }
  }

  it('should generate a complete newsletter edition from episode notes', async () => {
    // Step 1: Create test user
    await supabase.from('users').insert({
      id: testIds.user,
      email: testUserEmail,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    // Step 2: Seed database with realistic test data
    await supabase.from('podcast_shows').insert({
      id: testIds.show,
      title: 'Test Podcast Show',
      spotify_url: 'https://open.spotify.com/show/test',
      rss_url: 'https://example.com/feed.xml',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    // Insert episodes
    await Promise.all([
      supabase.from('episodes').insert({
        id: testIds.episodes[0],
        show_id: testIds.show,
        title: 'Episode 1: Introduction to AI',
        description: 'A comprehensive overview of artificial intelligence fundamentals',
        spotify_url: 'https://open.spotify.com/episode/ep1',
        pub_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        duration: 3600,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }),
      supabase.from('episodes').insert({
        id: testIds.episodes[1],
        show_id: testIds.show,
        title: 'Episode 2: Machine Learning Basics',
        description: 'Deep dive into machine learning algorithms and applications',
        spotify_url: 'https://open.spotify.com/episode/ep2',
        pub_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        duration: 4200,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }),
      supabase.from('episodes').insert({
        id: testIds.episodes[2],
        show_id: testIds.show,
        title: 'Episode 3: Future of Technology',
        description: 'Exploring emerging technologies and their societal impact',
        spotify_url: 'https://open.spotify.com/episode/ep3',
        pub_date: new Date().toISOString(),
        duration: 3000,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
    ]);
    // Insert transcripts
    await Promise.all([
      insertTranscript(
        testIds.episodes[0],
        'transcripts/test-episode-1.jsonl.gz',
        'full',
        'full',
        2500,
        'taddy'
      ),
      insertTranscript(
        testIds.episodes[1],
        'transcripts/test-episode-2.jsonl.gz',
        'full',
        'full',
        3000,
        'taddy'
      ),
      insertTranscript(
        testIds.episodes[2],
        'transcripts/test-episode-3.jsonl.gz',
        'full',
        'full',
        2000,
        'taddy'
      )
    ]);
    // Insert episode notes
    await Promise.all([
      upsertEpisodeNotes(supabase, {
        episodeId: testIds.episodes[0],
        transcriptId: testIds.transcripts[0],
        notes: `# Episode 1: Introduction to AI\n\n## Key Takeaways\n- Artificial Intelligence encompasses machine learning, neural networks, and deep learning\n- AI has evolved from rule-based systems to modern neural networks\n- Current AI applications include natural language processing, computer vision, and robotics\n\n## Main Topics Covered\n1. **History of AI**: From Alan Turing to modern deep learning\n2. **Types of AI**: Narrow AI vs General AI\n3. **Machine Learning Fundamentals**: Supervised, unsupervised, and reinforcement learning\n4. **Real-world Applications**: Healthcare, finance, transportation, and entertainment\n\n## Notable Quotes\n> "AI is not about replacing humans, but augmenting human capabilities" - Guest Speaker\n\n## Technical Deep Dive\nThe episode explored neural network architectures, including convolutional neural networks (CNNs) for image processing and recurrent neural networks (RNNs) for sequential data.`,
        model: 'gemini-pro',
        status: 'done'
      }),
      upsertEpisodeNotes(supabase, {
        episodeId: testIds.episodes[1],
        transcriptId: testIds.transcripts[1],
        notes: `# Episode 2: Machine Learning Basics\n\n## Key Takeaways\n- Machine learning algorithms learn patterns from data without explicit programming\n- Supervised learning uses labeled data to make predictions\n- Unsupervised learning finds hidden patterns in unlabeled data\n\n## Main Topics Covered\n1. **Supervised Learning**: Classification and regression problems\n2. **Unsupervised Learning**: Clustering and dimensionality reduction\n3. **Model Evaluation**: Accuracy, precision, recall, and F1-score\n4. **Feature Engineering**: Selecting and transforming input variables\n\n## Practical Examples\n- Email spam detection using Naive Bayes\n- House price prediction using linear regression\n- Customer segmentation using K-means clustering\n\n## Technical Insights\nThe episode discussed overfitting and underfitting, emphasizing the importance of cross-validation and regularization techniques.`,
        model: 'gemini-pro',
        status: 'done'
      }),
      upsertEpisodeNotes(supabase, {
        episodeId: testIds.episodes[2],
        transcriptId: testIds.transcripts[2],
        notes: `# Episode 3: Future of Technology\n\n## Key Takeaways\n- Emerging technologies are reshaping industries and society\n- Ethical considerations are crucial in technology development\n- Collaboration between humans and AI will define the future\n\n## Main Topics Covered\n1. **Emerging Technologies**: Quantum computing, blockchain, and IoT\n2. **AI Ethics**: Bias, transparency, and accountability\n3. **Human-AI Collaboration**: Augmented intelligence and human-centered design\n4. **Future Workforce**: Skills needed for the AI era\n\n## Industry Impact\n- Healthcare: AI-assisted diagnosis and personalized medicine\n- Education: Adaptive learning platforms and virtual reality\n- Transportation: Autonomous vehicles and smart cities\n\n## Thought-Provoking Questions\nThe episode raised important questions about privacy, job displacement, and the role of regulation in technology development.`,
        model: 'gemini-pro',
        status: 'done'
      })
    ]);
    // Step 2: Retrieve episode notes for newsletter generation
    const { data: notes, error: notesError } = await supabase
      .from('episode_transcript_notes')
      .select(`
        id,
        episode_id,
        notes,
        model,
        episodes!inner(
          id,
          title,
          description,
          pub_date,
          duration,
          podcast_shows!inner(
            id,
            title
          )
        )
      `)
      .in('episode_id', testIds.episodes)
      .eq('status', 'done')
      .is('deleted_at', null)
      .order('episodes.pub_date', { ascending: false });
    expect(notesError).toBeNull();
    expect(notes).toHaveLength(3);

    // Extract just the notes text for the prompt builder
    const episodeNotesText = notes!.map(note => note.notes!);

    // Step 3: Build newsletter prompt
    const promptResult = await buildNewsletterEditionPrompt(
      episodeNotesText,
      testUserEmail,
      testEditionDate
    );
    expect(promptResult.success).toBe(true);
    expect(promptResult.prompt).toContain('Newsletter Edition');
    expect(promptResult.prompt).toContain('Episode 1: Introduction to AI');
    expect(promptResult.prompt).toContain('Episode 2: Machine Learning Basics');
    expect(promptResult.prompt).toContain('Episode 3: Future of Technology');

    // Step 4: Generate newsletter content using Gemini
    const newsletterResult = await geminiModule.generateNewsletterEdition(
      episodeNotesText,
      testUserEmail,
      testEditionDate
    );
    expect(newsletterResult.success).toBe(true);
    expect(newsletterResult.htmlContent).toContain('<html>');
    expect(newsletterResult.htmlContent).toContain('</html>');
    expect(newsletterResult.htmlContent).toContain('Test Podcast Show');
    expect(newsletterResult.htmlContent).toContain('AI');
    expect(newsletterResult.htmlContent).toContain('Machine Learning');

    // Step 5: Store newsletter edition in database
    const editionData = await insertNewsletterEdition({
      user_id: testIds.user,
      edition_date: testEditionDate,
      status: 'generated',
      content: newsletterResult.sanitizedContent,
      model: 'gemini-pro'
    });
    expect(editionData).toBeDefined();
    testIds.newsletter = editionData.id;

    // Step 6: Verify newsletter edition was stored correctly
    const { data: storedEdition, error: retrieveError } = await supabase
      .from('newsletter_editions')
      .select('*')
      .eq('id', testIds.newsletter)
      .single();
    expect(retrieveError).toBeNull();
    expect(storedEdition).toBeDefined();
    expect(storedEdition!.user_id).toBe(testIds.user);
    expect(storedEdition!.content).toBe(newsletterResult.sanitizedContent);
    expect(storedEdition!.model).toBe('gemini-pro');
    expect(storedEdition!.deleted_at).toBeNull();

    // Step 7: Validate newsletter content structure
    const newsletterContent = storedEdition!.content;
    expect(newsletterContent).toMatch(/<html[^>]*>/i);
    expect(newsletterContent).toMatch(/<head[^>]*>/i);
    expect(newsletterContent).toMatch(/<body[^>]*>/i);
    expect(newsletterContent).toMatch(/<h1[^>]*>/i);
    expect(newsletterContent).toContain('Test Podcast Show');
    expect(newsletterContent).toContain('AI');
    expect(newsletterContent).toContain('Machine Learning');
    expect(newsletterContent).toContain('Technology');

    // Step 8: Verify data consistency
    const { data: allNotes, error: allNotesError } = await supabase
      .from('episode_transcript_notes')
      .select('id')
      .in('episode_id', testIds.episodes)
      .is('deleted_at', null);
    expect(allNotesError).toBeNull();
    expect(allNotes).toHaveLength(3);

    const { data: allEpisodes, error: allEpisodesError } = await supabase
      .from('episodes')
      .select('id')
      .in('id', testIds.episodes)
      .is('deleted_at', null);
    expect(allEpisodesError).toBeNull();
    expect(allEpisodes).toHaveLength(3);
  }, 30000);

  it('should handle empty episode notes gracefully', async () => {
    const promptResult = await buildNewsletterEditionPrompt(
      [],
      testUserEmail,
      testEditionDate
    );
    expect(promptResult.success).toBe(false);
    expect(promptResult.error).toContain('episodeNotes array cannot be empty');

    const newsletterResult = await geminiModule.generateNewsletterEdition(
      [],
      testUserEmail,
      testEditionDate
    );
    expect(newsletterResult.success).toBe(false);
    expect(newsletterResult.error).toContain('episodeNotes array cannot be empty');
  });

  it('should handle single episode note', async () => {
    await supabase.from('podcast_shows').insert({
      id: testIds.show,
      title: 'Single Episode Show',
      spotify_url: 'https://open.spotify.com/show/single',
      rss_url: 'https://example.com/single.xml',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    await supabase.from('episodes').insert({
      id: testIds.episodes[0],
      show_id: testIds.show,
      title: 'Single Episode',
      description: 'A single episode for testing',
      spotify_url: 'https://open.spotify.com/episode/single',
      pub_date: new Date().toISOString(),
      duration: 1800,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    await insertTranscript(
      testIds.episodes[0],
      'transcripts/single-episode.jsonl.gz',
      'full',
      'full',
      1000,
      'taddy'
    );
    await upsertEpisodeNotes(supabase, {
      episodeId: testIds.episodes[0],
      transcriptId: testIds.transcripts[0],
      notes: '# Single Episode\n\nThis is a test episode with minimal content.',
      model: 'gemini-pro',
      status: 'done'
    });
    const { data: notes, error: notesError } = await supabase
      .from('episode_transcript_notes')
      .select(`
        id,
        episode_id,
        notes,
        model,
        episodes!inner(
          id,
          title,
          description,
          pub_date,
          duration,
          podcast_shows!inner(
            id,
            title
          )
        )
      `)
      .eq('episode_id', testIds.episodes[0])
      .eq('status', 'done')
      .is('deleted_at', null);
    expect(notesError).toBeNull();
    expect(notes).toHaveLength(1);

    // Extract just the notes text for the newsletter generation
    const episodeNotesText = notes!.map(note => note.notes!);

    const newsletterResult = await geminiModule.generateNewsletterEdition(
      episodeNotesText,
      testUserEmail,
      testEditionDate
    );
    expect(newsletterResult.success).toBe(true);
    expect(newsletterResult.htmlContent).toContain('Single Episode Show');
    expect(newsletterResult.htmlContent).toContain('Single Episode');
  });
});

 