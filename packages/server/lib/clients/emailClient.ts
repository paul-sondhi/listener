/**
 * Email Client Wrapper for Resend API
 * 
 * Provides a simple interface for sending emails using the Resend service.
 * Handles authentication, error handling, and structured logging.
 * 
 * @author Listener Team
 * @since 2025-07-08
 */

import { Resend } from 'resend';
import { createLogger, Logger } from '../logger.js';

// Define interfaces for type safety
export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string; // Optional plain text alternative
  replyTo?: string; // Optional reply-to email address
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Email client wrapper for Resend API
 * Handles authentication, sending, and error handling
 */
export class EmailClient {
  private resend: Resend;
  private logger: Logger;
  private fromEmail: string;
  private fromName: string;

  constructor(apiKey: string, fromEmail: string, fromName?: string, resendInstance?: Resend) {
    this.resend = resendInstance || new Resend(apiKey);
    this.logger = createLogger();
    this.fromEmail = fromEmail;
    this.fromName = fromName || '';
  }

  /**
   * Send an email using Resend API
   * @param params Email parameters (to, subject, html, optional text)
   * @param jobId Job ID for traceability (added as X-Job-Id header)
   * @returns Promise<SendEmailResult> Result of the email send operation
   */
  async sendEmail(params: SendEmailParams, jobId: string): Promise<SendEmailResult> {
    const { to, subject, html, text, replyTo } = params;

    this.logger.info('email', 'Sending email via Resend', {
      metadata: {
        job_id: jobId,
        to_email: to,
        subject: subject,
        has_html: !!html,
        has_text: !!text,
        from_email: this.fromEmail,
        reply_to: replyTo || 'not set'
      }
    });

    try {
      // Format the from field: "Sender Name <email@domain.com>" or just "email@domain.com"
      const fromField = this.fromName ? `${this.fromName} <${this.fromEmail}>` : this.fromEmail;
      
      const emailData: any = {
        from: fromField,
        to: [to],
        subject: subject,
        html: html,
        text: text, // Optional plain text alternative
        headers: {
          'X-Job-Id': jobId
        }
      };
      
      // Add reply_to field if provided
      if (replyTo) {
        emailData.reply_to = replyTo;
      }
      
      const result = await this.resend.emails.send(emailData);

      if (result.error) {
        const errorMessage = `Resend API error: ${result.error.message}`;
        this.logger.error('email', 'Failed to send email via Resend', {
          metadata: {
            job_id: jobId,
            to_email: to,
            subject: subject,
            error: errorMessage,
            resend_error_code: result.error.statusCode
          }
        });

        return {
          success: false,
          error: errorMessage
        };
      }

      this.logger.info('email', 'Email sent successfully via Resend', {
        metadata: {
          job_id: jobId,
          to_email: to,
          subject: subject,
          message_id: result.data?.id,
          resend_message_id: result.data?.id
        }
      });

      return {
        success: true,
        messageId: result.data?.id
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error('email', 'Unexpected error sending email via Resend', {
        metadata: {
          job_id: jobId,
          to_email: to,
          subject: subject,
          error: errorMessage,
          stack_trace: errorStack
        }
      });

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Validate email client configuration
   * @returns boolean True if configuration is valid
   */
  validateConfig(): boolean {
    if (!this.fromEmail || this.fromEmail.trim().length === 0) {
      this.logger.error('email', 'Invalid from email configuration', {
        metadata: {
          from_email: this.fromEmail
        }
      });
      return false;
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.fromEmail)) {
      this.logger.error('email', 'Invalid from email format', {
        metadata: {
          from_email: this.fromEmail
        }
      });
      return false;
    }

    return true;
  }
}

/**
 * Factory function to create an EmailClient instance
 * @param apiKey Resend API key
 * @param fromEmail Email address to send from
 * @param fromName Optional sender name to display
 * @returns EmailClient instance
 */
export function createEmailClient(apiKey: string, fromEmail: string, fromName?: string, resendInstance?: Resend): EmailClient {
  return new EmailClient(apiKey, fromEmail, fromName, resendInstance);
} 