/**
 * Unit tests for EmailClient wrapper
 * 
 * Tests the email client functionality including sending emails,
 * error handling, and configuration validation.
 * 
 * @author Listener Team
 * @since 2025-07-08
 */

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { Logger } from '../../logger.js';

// Mock the Resend client
const mockResendSend = vi.fn();
const mockResend = {
  emails: {
    send: mockResendSend
  }
};

// Mock the logger
vi.mock('../../logger.js');

// Import mocked modules and EmailClient after mocks are set up
import * as logger from '../../logger.js';
import { EmailClient, createEmailClient, type SendEmailParams, type _SendEmailResult } from '../emailClient.js';

// Mock logger
const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn()
} as unknown as Logger;

describe('EmailClient', () => {
  let emailClient: EmailClient;
  let mockCreateLogger: Mock;

  const testApiKey = 're_test_key_123456789';
  const testFromEmail = 'test@listener.com';
  const testJobId = 'test-job-123';

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup logger mock
    mockCreateLogger = vi.mocked(logger.createLogger);
    mockCreateLogger.mockReturnValue(mockLogger);

    // Create email client instance with injected mockResend
    emailClient = new EmailClient(testApiKey, testFromEmail, mockResend as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create an EmailClient instance with valid parameters', () => {
      expect(emailClient).toBeInstanceOf(EmailClient);
    });

    it('should initialize with the provided API key and from email', () => {
      const client = new EmailClient('test-api-key', 'test@example.com');
      expect(client).toBeDefined();
    });
  });

  describe('sendEmail', () => {
    const testEmailParams: SendEmailParams = {
      to: 'recipient@example.com',
      subject: 'Test Subject',
      html: '<h1>Test HTML</h1>'
    };

    it('should send email successfully and return success result', async () => {
      // Mock successful response
      mockResendSend.mockResolvedValue({
        data: { id: 'test-message-id-123' },
        error: null
      });

      const result = await emailClient.sendEmail(testEmailParams, testJobId);

      expect(result).toEqual({
        success: true,
        messageId: 'test-message-id-123'
      });

      // Verify Resend was called with correct parameters
      expect(mockResendSend).toHaveBeenCalledWith({
        from: testFromEmail,
        to: [testEmailParams.to],
        subject: testEmailParams.subject,
        html: testEmailParams.html,
        text: undefined,
        headers: {
          'X-Job-Id': testJobId
        }
      });
    });

    it('should send email with text alternative when provided', async () => {
      const emailParamsWithText: SendEmailParams = {
        ...testEmailParams,
        text: 'Test plain text content'
      };

      mockResendSend.mockResolvedValue({
        data: { id: 'test-message-id-456' },
        error: null
      });

      const result = await emailClient.sendEmail(emailParamsWithText, testJobId);

      expect(result.success).toBe(true);
      expect(mockResendSend).toHaveBeenCalledWith({
        from: testFromEmail,
        to: [emailParamsWithText.to],
        subject: emailParamsWithText.subject,
        html: emailParamsWithText.html,
        text: emailParamsWithText.text,
        headers: {
          'X-Job-Id': testJobId
        }
      });
    });

    it('should handle Resend API errors and return failure result', async () => {
      // Mock API error response
      mockResendSend.mockResolvedValue({
        data: null,
        error: {
          message: 'Invalid API key',
          statusCode: 401
        }
      });

      const result = await emailClient.sendEmail(testEmailParams, testJobId);

      expect(result).toEqual({
        success: false,
        error: 'Resend API error: Invalid API key'
      });
    });

    it('should handle unexpected errors and return failure result', async () => {
      // Mock unexpected error
      mockResendSend.mockRejectedValue(new Error('Network timeout'));

      const result = await emailClient.sendEmail(testEmailParams, testJobId);

      expect(result).toEqual({
        success: false,
        error: 'Network timeout'
      });
    });

    it('should handle non-Error exceptions', async () => {
      // Mock non-Error exception
      mockResendSend.mockRejectedValue('String error');

      const result = await emailClient.sendEmail(testEmailParams, testJobId);

      expect(result).toEqual({
        success: false,
        error: 'Unknown error'
      });
    });

    it('should log success and error cases appropriately', async () => {
      // Test success logging
      mockResendSend.mockResolvedValue({
        data: { id: 'success-id' },
        error: null
      });

      await emailClient.sendEmail(testEmailParams, testJobId);

      expect(mockLogger.info).toHaveBeenCalledWith('email', 'Sending email via Resend', expect.any(Object));
      expect(mockLogger.info).toHaveBeenCalledWith('email', 'Email sent successfully via Resend', expect.any(Object));

      // Test error logging
      mockResendSend.mockResolvedValue({
        data: null,
        error: { message: 'API Error', statusCode: 400 }
      });

      await emailClient.sendEmail(testEmailParams, testJobId);

      expect(mockLogger.error).toHaveBeenCalledWith('email', 'Failed to send email via Resend', expect.any(Object));
    });
  });

  describe('validateConfig', () => {
    it('should return true for valid configuration', () => {
      const client = new EmailClient('valid-api-key', 'valid@example.com');
      expect(client.validateConfig()).toBe(true);
    });

    it('should return false for empty from email', () => {
      const client = new EmailClient('valid-api-key', '');
      expect(client.validateConfig()).toBe(false);
    });

    it('should return false for whitespace-only from email', () => {
      const client = new EmailClient('valid-api-key', '   ');
      expect(client.validateConfig()).toBe(false);
    });

    it('should return false for invalid email format', () => {
      const client = new EmailClient('valid-api-key', 'invalid-email');
      expect(client.validateConfig()).toBe(false);
    });

    it('should return false for email without domain', () => {
      const client = new EmailClient('valid-api-key', 'test@');
      expect(client.validateConfig()).toBe(false);
    });

    it('should return false for email without @ symbol', () => {
      const client = new EmailClient('valid-api-key', 'test.example.com');
      expect(client.validateConfig()).toBe(false);
    });
  });
});

describe('createEmailClient', () => {
  it('should create an EmailClient instance', () => {
    const client = createEmailClient('test-api-key', 'test@example.com');
    expect(client).toBeInstanceOf(EmailClient);
  });

  it('should pass parameters to the EmailClient constructor', () => {
    const apiKey = 'test-api-key-123';
    const fromEmail = 'test@listener.com';
    
    const client = createEmailClient(apiKey, fromEmail);
    
    // The client should be created successfully
    expect(client).toBeDefined();
  });
}); 