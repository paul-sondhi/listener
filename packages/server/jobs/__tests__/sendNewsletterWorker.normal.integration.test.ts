/**
 * Integration Tests for SendNewsletterWorker - Normal Mode
 *
 * This test verifies the normal mode workflow of the send newsletter worker:
 * - Normal mode: sends to user, updates sent_at
 * - Handles errors gracefully
 * - Verifies email sending via mocked Resend SDK
 */

// Mock Resend SDK
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn().mockResolvedValue({
        data: { id: 'mock-message-id-123' },
        error: null
      })
    }
  }))
}));

// Mock EmailClient factory function
vi.mock('../../lib/clients/emailClient.js', () => ({
  EmailClient: vi.fn(),
  createEmailClient: vi.fn().mockImplementation(() => ({
    sendEmail: vi.fn().mockImplementation((params) => {
      console.log('Mock sendEmail called with params:', params);
      return Promise.resolve({ success: true, messageId: 'mock-message-id-123' });
    }),
    validateConfig: vi.fn().mockReturnValue(true)
  }))
}));

// Add a variable to hold the config to return
let mockConfigFunction: () => any = () => ({});

// Top-level mock for the config module
vi.mock('../../config/sendNewsletterWorkerConfig.js', async () => {
  const actual = await vi.importActual<any>('../../config/sendNewsletterWorkerConfig.js');
  return {
    ...actual,
    getSendNewsletterWorkerConfig: () => mockConfigFunction(),
    validateDependencies: vi.fn()
  };
});

// Now import everything else
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';

process.env.RESEND_API_KEY = 're_test_key_123';
process.env.SEND_FROM_EMAIL = 'test@example.com';
process.env.TEST_RECEIVER_EMAIL = 'test+receiver@example.com';
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

import { updateNewsletterEditionSentAt } from '../../lib/db/sendNewsletterQueries.js';
import * as emailClientModule from '../../lib/clients/emailClient.js';

// Get reference to mocked createEmailClient
const mockCreateEmailClient = emailClientModule.createEmailClient as any;

const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
const supabase = createClient(supabaseUrl, supabaseKey);

const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';
const TEST_EMAIL = 'test@example.com';

// Mock setup for Resend SDK and EmailClient
let mockEmailClient: any;
let mockResend: any;

async function createTestEdition(id: string, sentAt: string | null = null) {
  await supabase.from('newsletter_editions').insert({
    id,
    user_id: TEST_USER_ID,
    edition_date: '2025-01-27',
    status: 'generated',
    user_email: TEST_EMAIL,
    content: 'Integration test content',
    model: 'gemini-pro',
    error_message: null,
    sent_at: sentAt,
    created_at: new Date().toISOString(),
    deleted_at: null // Explicitly set deleted_at to null
  });
}

async function cleanup() {
  await supabase.from('newsletter_editions').delete().eq('user_id', TEST_USER_ID);
}

describe('SendNewsletterWorker Normal Mode (integration)', () => {
  beforeEach(async () => {
    await cleanup();
    // Reset all mocks to default success behavior
    vi.clearAllMocks();
    // Reset mock config to ensure test isolation
    mockConfigFunction = () => ({});
  });
  afterEach(async () => {
    await cleanup();
    // Clean up mocks
    vi.restoreAllMocks();
  });

  it('should run worker and return result even with no editions', async () => {
    // Patch config to normal mode
    mockConfigFunction = () => ({
      enabled: true,
      cronSchedule: '0 5 * * 1-5',
      lookbackHours: 24,
      last10Mode: false,
      resendApiKey: 're_test_key_123',
      sendFromEmail: 'test@example.com',
      testReceiverEmail: 'test+receiver@example.com'
    });

    // Import worker after config mock
    const { SendNewsletterWorker } = await import('../sendNewsletterWorker.js');
    const worker = new SendNewsletterWorker();
    
    let result;
    try {
      result = await worker.run();
      console.error('Worker result:', result);
    } catch (error) {
      console.error('Worker failed with error:', error);
      throw error;
    }

    // Verify that the worker returns a result structure
    expect(result).toHaveProperty('totalCandidates');
    expect(result).toHaveProperty('processedEditions');
    expect(result).toHaveProperty('successfulSends');
    expect(result).toHaveProperty('errorCount');
    expect(result).toHaveProperty('totalElapsedMs');
    expect(result).toHaveProperty('averageProcessingTimeMs');
    expect(result).toHaveProperty('successRate');

    // With no editions, should have 0 candidates
    expect(result.totalCandidates).toBe(0);
    expect(result.processedEditions).toBe(0);
    expect(result.successfulSends).toBe(0);
    expect(result.errorCount).toBe(0);
  });

  it('should update sent_at for all eligible editions in normal mode', async () => {
    await createTestEdition('edition-1');
    await createTestEdition('edition-2');
    // Already sent
    await createTestEdition('edition-3', new Date().toISOString());

    // Wait for DB consistency
    await new Promise(res => setTimeout(res, 200));

    // Reset email client mock to ensure it works in this test
    vi.clearAllMocks();
    mockCreateEmailClient.mockImplementation(() => ({
      sendEmail: vi.fn().mockImplementation((params) => {
        console.log('Mock sendEmail called with params:', params);
        return Promise.resolve({ success: true, messageId: 'mock-message-id-123' });
      }),
      validateConfig: vi.fn().mockReturnValue(true)
    }));

    // Patch config to normal mode
    mockConfigFunction = () => ({
      enabled: true,
      cronSchedule: '0 5 * * 1-5',
      lookbackHours: 24,
      last10Mode: false,
      resendApiKey: 're_test_key_123',
      sendFromEmail: 'test@example.com',
      testReceiverEmail: 'test+receiver@example.com'
    });
    console.log('DEBUG: Set mockConfig to:', mockConfigFunction());
    
    // Import worker after config mock
    const { SendNewsletterWorker } = await import('../sendNewsletterWorker.js');
    const worker = new SendNewsletterWorker();
    
    let result;
    try {
      result = await worker.run();
    } catch (error) {
      console.error('Worker failed with error:', error);
      throw error;
    }

    // Wait for DB consistency after worker run
    await new Promise(res => setTimeout(res, 500));

    // Debug: Check what the worker actually processed
    console.error('Worker result details:', {
      totalCandidates: result.totalCandidates,
      processedEditions: result.processedEditions,
      successfulSends: result.successfulSends,
      errorCount: result.errorCount,
      noContentCount: result.noContentCount
    });

    // Debug: Check what editions the worker found
    console.error('Worker found editions:', result.totalCandidates);
    console.error('Worker processed editions:', result.processedEditions);
    console.error('Worker successful sends:', result.successfulSends);

    // Check if the worker found any editions
    if (result.totalCandidates === 0) {
      console.error('WORKER: No editions found! This is the problem.');
    } else {
      console.error('WORKER: Found editions, but sent_at not updated. This suggests email sending failed.');
    }

    // For now, just check that the worker runs and returns the expected structure
    expect(result).toHaveProperty('totalCandidates');
    expect(result).toHaveProperty('processedEditions');
    expect(result).toHaveProperty('successfulSends');
    expect(result).toHaveProperty('errorCount');
    expect(result).toHaveProperty('totalElapsedMs');
    expect(result).toHaveProperty('averageProcessingTimeMs');
    expect(result).toHaveProperty('successRate');

    // Check that the worker found some editions (even if it's 0, that's valid for testing)
    expect(typeof result.totalCandidates).toBe('number');
    expect(typeof result.processedEditions).toBe('number');
    expect(typeof result.successfulSends).toBe('number');
    expect(typeof result.errorCount).toBe('number');

    // Task 5.3: Test sent_at handling in normal mode
    // Verify that sent_at is updated only on successful email sends
    const { data: editionsAfter } = await supabase
      .from('newsletter_editions')
      .select('id, sent_at, status')
      .eq('user_id', TEST_USER_ID)
      .order('id');

    // Check that editions that were successfully sent now have sent_at timestamps
    const edition1 = editionsAfter?.find(e => e.id === 'edition-1');
    const edition2 = editionsAfter?.find(e => e.id === 'edition-2');
    const edition3 = editionsAfter?.find(e => e.id === 'edition-3');

    // edition-1 and edition-2 should have sent_at updated (successful sends)
    expect(edition1?.sent_at).not.toBeNull();
    expect(edition2?.sent_at).not.toBeNull();
    
    // edition-3 should still have its original sent_at (was already sent)
    expect(edition3?.sent_at).not.toBeNull();

    // Verify that sent_at timestamps are recent (within last 5 seconds)
    const now = new Date();
    const fiveSecondsAgo = new Date(now.getTime() - 5000);
    
    expect(new Date(edition1!.sent_at!).getTime()).toBeGreaterThan(fiveSecondsAgo.getTime());
    expect(new Date(edition2!.sent_at!).getTime()).toBeGreaterThan(fiveSecondsAgo.getTime());

    // Verify that the worker reports the correct number of successful sends
    expect(result.successfulSends).toBe(2); // edition-1 and edition-2
    expect(result.errorCount).toBe(0);

    // TODO: Add email sending assertions in sub-task 5.4
    // - Verify that EmailClient.sendEmail was called with correct parameters
    // - Verify email parameters: from address, to address, subject line, HTML body, headers
  });

  it('should NOT update sent_at when email sending fails in normal mode', async () => {
    await createTestEdition('edition-fail-1');
    await createTestEdition('edition-fail-2');

    // Wait for DB consistency
    await new Promise(res => setTimeout(res, 200));

    // Reset email client mock to simulate failure
    vi.clearAllMocks();
    mockCreateEmailClient.mockImplementation(() => ({
      sendEmail: vi.fn().mockImplementation((params) => {
        console.log('Mock sendEmail called with params (will fail):', params);
        return Promise.resolve({ success: false, error: 'Mock email failure' });
      }),
      validateConfig: vi.fn().mockReturnValue(true)
    }));

    // Patch config to normal mode
    mockConfigFunction = () => ({
      enabled: true,
      cronSchedule: '0 5 * * 1-5',
      lookbackHours: 24,
      last10Mode: false,
      resendApiKey: 're_test_key_123',
      sendFromEmail: 'test@example.com',
      testReceiverEmail: 'test+receiver@example.com'
    });

    // Import worker after config mock
    const { SendNewsletterWorker } = await import('../sendNewsletterWorker.js');
    const worker = new SendNewsletterWorker();
    const result = await worker.run();

    // Task 5.3: Test sent_at handling when email sending fails
    // Verify that sent_at is NOT updated when email sending fails
    const { data: editionsAfter } = await supabase
      .from('newsletter_editions')
      .select('id, sent_at, status')
      .eq('user_id', TEST_USER_ID)
      .order('id');

    // Check that editions still have null sent_at (failed sends should not update sent_at)
    const editionFail1 = editionsAfter?.find(e => e.id === 'edition-fail-1');
    const editionFail2 = editionsAfter?.find(e => e.id === 'edition-fail-2');

    // Both editions should still have null sent_at (failed sends don't update sent_at)
    expect(editionFail1?.sent_at).toBeNull();
    expect(editionFail2?.sent_at).toBeNull();

    // Verify that the worker reports failed sends
    expect(result.successfulSends).toBe(0);
    expect(result.errorCount).toBe(2); // Both editions failed to send
  });
}); 