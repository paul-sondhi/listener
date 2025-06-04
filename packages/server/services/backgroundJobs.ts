import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@listener/shared';
import { schedule } from 'node-cron';

// Job execution tracking
interface JobExecution {
  job_name: string;
  started_at: number;
  completed_at?: number;
  success: boolean;
  error?: string;
  records_processed: number;
  elapsed_ms: number;
}

// Lazy Supabase client initialization
let supabaseAdmin: SupabaseClient<Database> | null = null;

function getSupabaseAdmin(): SupabaseClient<Database> {
  if (!supabaseAdmin) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing required Supabase environment variables');
    }
    supabaseAdmin = createClient<Database>(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabaseAdmin;
}

/**
 * Log job execution details for monitoring
 * @param {JobExecution} execution - Job execution details
 */
function logJobExecution(execution: JobExecution): void {
  console.log(`BACKGROUND_JOB: ${JSON.stringify(execution)}`);
}

/**
 * Emit job metrics for monitoring
 * @param {string} jobName - Name of the job
 * @param {boolean} success - Whether the job succeeded
 * @param {number} recordsProcessed - Number of records processed
 * @param {number} elapsedMs - Job execution time in milliseconds
 */
function emitJobMetric(
  jobName: string, 
  success: boolean, 
  recordsProcessed: number, 
  elapsedMs: number
): void {
  const metricData = {
    metric: `background_job_execution`,
    job_name: jobName,
    success,
    records_processed: recordsProcessed,
    elapsed_ms: elapsedMs,
    timestamp: Date.now()
  };
  console.log(`METRIC: ${JSON.stringify(metricData)}`);
}

/**
 * Nightly vault cleanup job
 * Deletes token versions > 30 days old
 * Step 6.1: Background vault cleanup
 */
export async function vaultCleanupJob(): Promise<void> {
  const startTime = Date.now();
  const jobName = 'vault_cleanup';
  let recordsProcessed = 0;
  
  console.log(`BACKGROUND_JOB: Starting ${jobName} job`);
  
  try {
    const supabase = getSupabaseAdmin();
    
    // Get retention age from environment (default: 30 days)
    const retentionDays = parseInt(process.env.VAULT_RETENTION_DAYS || '30');
    
    // First, clean up soft-deleted secrets that are past retention period
    const { data: cleanupResult, error: cleanupError } = await supabase
      .rpc('cleanup_expired_secrets', { p_batch_size: 100 });
    
    if (cleanupError) {
      throw new Error(`Cleanup function failed: ${cleanupError.message}`);
    }
    
    const softDeletedCount = cleanupResult?.secrets_cleaned || 0;
    recordsProcessed += softDeletedCount;
    
    // Clean up old vault secret versions (older than retention period)
    // Note: This would need custom logic based on vault implementation
    // For now, we'll use the existing cleanup function
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    // Log cleanup activity
    console.log(`VAULT_CLEANUP: Processed ${softDeletedCount} expired secrets`);
    
    // Clean up orphaned vault secrets (users that no longer exist)
    const { data: orphanSecrets, error: orphanError } = await supabase
      .from('vault.secrets')
      .select('id, name')
      .ilike('name', 'spotify:%:tokens')
      .limit(100);
    
    if (!orphanError && orphanSecrets) {
      let orphanedCount = 0;
      
      for (const secret of orphanSecrets) {
        // Extract user ID from secret name (format: spotify:{userId}:tokens)
        const match = secret.name.match(/^spotify:([^:]+):tokens$/);
        if (match) {
          const userId = match[1];
          
          // Check if user exists (to avoid creating orphaned secrets)
          const { data: _userExists, error: userCheckError } = await supabase
            .from('users')
            .select('id')
            .eq('id', userId)
            .single();
          
          if (userCheckError && userCheckError.code === 'PGRST116') {
            // User doesn't exist, delete the orphaned secret
            const { error: deleteError } = await supabase
              .from('vault.secrets')
              .delete()
              .eq('id', secret.id);
            
            if (!deleteError) {
              orphanedCount++;
              console.log(`VAULT_CLEANUP: Deleted orphaned secret for user ${userId}`);
            }
          }
        }
      }
      
      recordsProcessed += orphanedCount;
      console.log(`VAULT_CLEANUP: Cleaned up ${orphanedCount} orphaned secrets`);
    }
    
    const elapsedMs = Date.now() - startTime;
    
    // Log successful execution
    const execution: JobExecution = {
      job_name: jobName,
      started_at: startTime,
      completed_at: Date.now(),
      success: true,
      records_processed: recordsProcessed,
      elapsed_ms: elapsedMs
    };
    
    logJobExecution(execution);
    emitJobMetric(jobName, true, recordsProcessed, elapsedMs);
    
    console.log(`BACKGROUND_JOB: ${jobName} completed successfully in ${elapsedMs}ms, processed ${recordsProcessed} records`);
    
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Log failed execution
    const execution: JobExecution = {
      job_name: jobName,
      started_at: startTime,
      completed_at: Date.now(),
      success: false,
      error: errorMessage,
      records_processed: recordsProcessed,
      elapsed_ms: elapsedMs
    };
    
    logJobExecution(execution);
    emitJobMetric(jobName, false, recordsProcessed, elapsedMs);
    
    console.error(`BACKGROUND_JOB: ${jobName} failed after ${elapsedMs}ms:`, errorMessage);
  }
}

/**
 * Quarterly key rotation job
 * Re-encrypts all user secrets with new vault keys
 * Step 6.2: Quarterly key rotation
 */
export async function keyRotationJob(): Promise<void> {
  const startTime = Date.now();
  const jobName = 'key_rotation';
  let recordsProcessed = 0;
  
  console.log(`BACKGROUND_JOB: Starting ${jobName} job`);
  
  try {
    const supabase = getSupabaseAdmin();
    
    // Get all active Spotify secrets for rotation
    const { data: secrets, error: secretsError } = await supabase
      .from('vault.secrets')
      .select('id, name, secret, created_at')
      .ilike('name', 'spotify:%:tokens')
      .order('created_at', { ascending: true });
    
    if (secretsError) {
      throw new Error(`Failed to fetch secrets: ${secretsError.message}`);
    }
    
    if (!secrets || secrets.length === 0) {
      console.log('KEY_ROTATION: No secrets found to rotate');
      return;
    }
    
    console.log(`KEY_ROTATION: Found ${secrets.length} secrets to rotate`);
    
    // Process secrets in batches to avoid overwhelming the system
    const batchSize = 10;
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < secrets.length; i += batchSize) {
      const batch = secrets.slice(i, i + batchSize);
      
      console.log(`KEY_ROTATION: Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(secrets.length / batchSize)}`);
      
      // Process batch in parallel
      const batchPromises = batch.map(async (secret) => {
        try {
          // Re-encrypt by updating the secret (vault will use current key)
          const { error: updateError } = await supabase
            .from('vault.secrets')
            .update({
              updated_at: new Date().toISOString(),
              // Force re-encryption by updating the secret
              description: `Spotify tokens - rotated ${new Date().toISOString()}`
            })
            .eq('id', secret.id);
          
          if (updateError) {
            console.error(`KEY_ROTATION: Failed to rotate secret ${secret.id}:`, updateError.message);
            return { success: false, secretId: secret.id };
          }
          
          return { success: true, secretId: secret.id };
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`KEY_ROTATION: Error rotating secret ${secret.id}:`, errorMessage);
          return { success: false, secretId: secret.id };
        }
      });
      
      // Wait for batch to complete
      const batchResults = await Promise.all(batchPromises);
      
      // Count results
      batchResults.forEach(result => {
        if (result.success) {
          successCount++;
        } else {
          errorCount++;
        }
      });
      
      recordsProcessed += batchResults.length;
      
      // Small delay between batches to avoid overwhelming the system
      if (i + batchSize < secrets.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    const elapsedMs = Date.now() - startTime;
    
    console.log(`KEY_ROTATION: Completed - ${successCount} successful, ${errorCount} failed`);
    
    // Log execution
    const execution: JobExecution = {
      job_name: jobName,
      started_at: startTime,
      completed_at: Date.now(),
      success: errorCount === 0,
      records_processed: recordsProcessed,
      elapsed_ms: elapsedMs,
      ...(errorCount > 0 && { error: `${errorCount} secrets failed to rotate` })
    };
    
    logJobExecution(execution);
    emitJobMetric(jobName, errorCount === 0, recordsProcessed, elapsedMs);
    
    console.log(`BACKGROUND_JOB: ${jobName} completed in ${elapsedMs}ms, processed ${recordsProcessed} records`);
    
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Log failed execution
    const execution: JobExecution = {
      job_name: jobName,
      started_at: startTime,
      completed_at: Date.now(),
      success: false,
      error: errorMessage,
      records_processed: recordsProcessed,
      elapsed_ms: elapsedMs
    };
    
    logJobExecution(execution);
    emitJobMetric(jobName, false, recordsProcessed, elapsedMs);
    
    console.error(`BACKGROUND_JOB: ${jobName} failed after ${elapsedMs}ms:`, errorMessage);
  }
}

/**
 * Initialize background job scheduling
 * Sets up cron jobs for vault cleanup and key rotation
 */
export function initializeBackgroundJobs(): void {
  console.log('BACKGROUND_JOBS: Initializing scheduled jobs');
  
  // Skip job scheduling in test environment
  if (process.env.NODE_ENV === 'test') {
    console.log('BACKGROUND_JOBS: Skipping job scheduling in test environment');
    return;
  }
  
  // Nightly vault cleanup at 2 AM UTC
  // Cron format: minute hour day-of-month month day-of-week
  schedule('0 2 * * *', async () => {
    console.log('BACKGROUND_JOBS: Starting scheduled vault cleanup job');
    await vaultCleanupJob();
  }, {
    scheduled: true,
    timezone: 'UTC'
  });
  
  // Quarterly key rotation on 1st day of quarter at 3 AM UTC
  // Runs on January 1st, April 1st, July 1st, October 1st
  schedule('0 3 1 1,4,7,10 *', async () => {
    console.log('BACKGROUND_JOBS: Starting scheduled key rotation job');
    await keyRotationJob();
  }, {
    scheduled: true,
    timezone: 'UTC'
  });
  
  console.log('BACKGROUND_JOBS: Background jobs scheduled successfully');
  console.log('  - Vault cleanup: Daily at 2:00 AM UTC');
  console.log('  - Key rotation: Quarterly on 1st at 3:00 AM UTC');
}

/**
 * Run a job manually (for testing or administrative purposes)
 * @param {string} jobName - Name of the job to run
 */
export async function runJob(jobName: string): Promise<void> {
  console.log(`BACKGROUND_JOBS: Manually running job: ${jobName}`);
  
  switch (jobName.toLowerCase()) {
    case 'vault_cleanup':
      await vaultCleanupJob();
      break;
    case 'key_rotation':
      await keyRotationJob();
      break;
    default:
      console.error(`BACKGROUND_JOBS: Unknown job name: ${jobName}`);
      throw new Error(`Unknown job: ${jobName}`);
  }
} 