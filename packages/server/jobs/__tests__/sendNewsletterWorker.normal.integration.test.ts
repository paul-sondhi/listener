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

async function createTestEdition(id: string, sentAt: string | null = null, content?: string) {
  await supabase.from('newsletter_editions').insert({
    id,
    user_id: TEST_USER_ID,
    edition_date: '2025-01-27',
    status: 'generated',
    user_email: TEST_EMAIL,
    content: content || 'Integration test content',
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

    // Task 5.4: Verify email parameters
    // Verify that EmailClient.sendEmail was called with correct parameters
    expect(mockCreateEmailClient).toHaveBeenCalled();
    
    // Get the mock client instance to check sendEmail calls
    const mockClientInstance = mockCreateEmailClient.mock.results[0]?.value;
    expect(mockClientInstance.sendEmail).toHaveBeenCalledTimes(2);

    // Verify email parameters for both calls
    const sendEmailCalls = mockClientInstance.sendEmail.mock.calls;
    expect(sendEmailCalls).toHaveLength(2);
    
    // Check first email (edition-1)
    const firstCall = sendEmailCalls[0];
    const [firstParams] = firstCall;
    console.log('First email params:', JSON.stringify(firstParams, null, 2));
    expect(firstParams.to).toBe('test@example.com');
    expect(firstParams.subject).toMatch(/^Listener Recap: .+$/);
    expect(firstParams.html).toContain('Integration test content');
    // Note: Placeholders are not being injected, so we'll check for the original content
    // expect(firstParams.html).toContain('[USER_EMAIL]');
    // expect(firstParams.html).toContain('[EDITION_DATE]');
    // expect(firstParams.html).toContain('[EPISODE_COUNT]');
    // expect(firstParams.html).toContain('[FOOTER_TEXT]');
    
    // Check second email (edition-2)
    const secondCall = sendEmailCalls[1];
    const [secondParams] = secondCall;
    console.log('Second email params:', JSON.stringify(secondParams, null, 2));
    expect(secondParams.to).toBe('test@example.com');
    expect(secondParams.subject).toMatch(/^Listener Recap: .+$/);
    expect(secondParams.html).toContain('Integration test content');
    // Note: Placeholders are not being injected, so we'll check for the original content
    // expect(secondParams.html).toContain('[USER_EMAIL]');
    // expect(secondParams.html).toContain('[EDITION_DATE]');
    // expect(secondParams.html).toContain('[EPISODE_COUNT]');
    // expect(secondParams.html).toContain('[FOOTER_TEXT]');
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

    // Task 5.4: Verify email parameters even for failed sends
    // Verify that EmailClient.sendEmail was called with correct parameters
    expect(mockCreateEmailClient).toHaveBeenCalled();
    
    // Get the mock client instance to check sendEmail calls
    const mockClientInstance = mockCreateEmailClient.mock.results[0]?.value;
    expect(mockClientInstance.sendEmail).toHaveBeenCalledTimes(2);

    // Verify email parameters for both calls (even though they failed)
    const sendEmailCalls = mockClientInstance.sendEmail.mock.calls;
    expect(sendEmailCalls).toHaveLength(2);
    
    // Check first email (edition-fail-1)
    const firstCall = sendEmailCalls[0];
    const [firstParams] = firstCall;
    console.log('First failed email params:', JSON.stringify(firstParams, null, 2));
    expect(firstParams.to).toBe('test@example.com');
    expect(firstParams.subject).toMatch(/^Listener Recap: .+$/);
    expect(firstParams.html).toContain('Integration test content');
    // Note: Placeholders are not being injected, so we'll check for the original content
    // expect(firstParams.html).toContain('[USER_EMAIL]');
    // expect(firstParams.html).toContain('[EDITION_DATE]');
    // expect(firstParams.html).toContain('[EPISODE_COUNT]');
    // expect(firstParams.html).toContain('[FOOTER_TEXT]');
    
    // Check second email (edition-fail-2)
    const secondCall = sendEmailCalls[1];
    const [secondParams] = secondCall;
    console.log('Second failed email params:', JSON.stringify(secondParams, null, 2));
    expect(secondParams.to).toBe('test@example.com');
    expect(secondParams.subject).toMatch(/^Listener Recap: .+$/);
    expect(secondParams.html).toContain('Integration test content');
    // Note: Placeholders are not being injected, so we'll check for the original content
    // expect(secondParams.html).toContain('[USER_EMAIL]');
    // expect(secondParams.html).toContain('[EDITION_DATE]');
    // expect(secondParams.html).toContain('[EDITION_DATE]');
    // expect(secondParams.html).toContain('[EPISODE_COUNT]');
    //     expect(secondParams.html).toContain('[FOOTER_TEXT]');
  });

  it('should inject placeholders correctly when content contains placeholders', async () => {
    // Create test edition with placeholders in content
    const contentWithPlaceholders = `
      <h1>Your Daily Listener Recap</h1>
      <p>Hello [USER_EMAIL],</p>
      <p>Here's your recap for [EDITION_DATE] with [EPISODE_COUNT] episodes.</p>
      <div>[FOOTER_TEXT]</div>
    `;
    await createTestEdition('edition-placeholders', null, contentWithPlaceholders);

    // Wait for DB consistency
    await new Promise(res => setTimeout(res, 200));

    // Reset email client mock
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

    // Import worker after config mock
    const { SendNewsletterWorker } = await import('../sendNewsletterWorker.js');
    const worker = new SendNewsletterWorker();
    const result = await worker.run();

    // Verify that the worker processed the edition
    expect(result.successfulSends).toBe(1);
    expect(result.errorCount).toBe(0);

    // Verify that EmailClient.sendEmail was called
    expect(mockCreateEmailClient).toHaveBeenCalled();
    
    // Get the mock client instance to check sendEmail calls
    const mockClientInstance = mockCreateEmailClient.mock.results[0]?.value;
    expect(mockClientInstance.sendEmail).toHaveBeenCalledTimes(1);

    // Verify email parameters with placeholder injection
    const sendEmailCalls = mockClientInstance.sendEmail.mock.calls;
    const [params] = sendEmailCalls[0];
    
    console.log('Email params with placeholders:', JSON.stringify(params, null, 2));
    
    expect(params.to).toBe('test@example.com');
    expect(params.subject).toMatch(/^Listener Recap: .+$/);
    
    // Verify that placeholders were replaced
    expect(params.html).toContain('test@example.com'); // [USER_EMAIL] replaced
    expect(params.html).toContain('2025-01-27'); // [EDITION_DATE] replaced
    expect(params.html).toContain('N/A'); // [EPISODE_COUNT] replaced
    expect(params.html).toContain('You are receiving this email as part of your Listener subscription'); // [FOOTER_TEXT] replaced
    
    // Verify that original placeholders are NOT in the content
    expect(params.html).not.toContain('[USER_EMAIL]');
    expect(params.html).not.toContain('[EDITION_DATE]');
    expect(params.html).not.toContain('[EPISODE_COUNT]');
    expect(params.html).not.toContain('[FOOTER_TEXT]');
  });
});  