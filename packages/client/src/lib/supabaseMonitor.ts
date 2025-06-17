/**
 * Supabase Connection Monitor
 * 
 * Utility to monitor and diagnose Supabase connection issues,
 * particularly for the auth.signOut() hanging problem.
 */

import { supabase } from './supabaseClient';
import { logger } from './logger';

interface ConnectionTestResult {
  success: boolean;
  duration: number;
  error?: string;
  operation: string;
}

interface SupabaseHealthCheck {
  timestamp: string;
  overallHealth: 'healthy' | 'degraded' | 'unhealthy';
  tests: ConnectionTestResult[];
  summary: {
    totalTests: number;
    passedTests: number;
    avgResponseTime: number;
    slowestOperation: string;
    slowestDuration: number;
  };
}

/**
 * Test various Supabase operations to detect connection issues
 */
export class SupabaseMonitor {
  private readonly TIMEOUT_MS = 5000; // Same timeout as auth signOut

  /**
   * Test if Supabase auth operations are responsive
   */
  async testAuthOperations(): Promise<ConnectionTestResult[]> {
    const tests: Array<() => Promise<ConnectionTestResult>> = [
      () => this.testOperation('getSession', () => supabase.auth.getSession()),
      () => this.testOperation('getUser', () => supabase.auth.getUser()),
    ];

    const results = await Promise.allSettled(
      tests.map(test => test())
    );

    return results.map(result => 
      result.status === 'fulfilled' 
        ? result.value 
        : { success: false, duration: this.TIMEOUT_MS, error: 'Test execution failed', operation: 'unknown' }
    );
  }

  /**
   * Test a specific Supabase operation with timeout
   */
  private async testOperation(
    operationName: string, 
    operation: () => Promise<any>
  ): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`${operationName} timeout after ${this.TIMEOUT_MS}ms`)), this.TIMEOUT_MS);
      });
      
      await Promise.race([operation(), timeoutPromise]);
      const duration = Date.now() - startTime;
      
      return {
        success: true,
        duration,
        operation: operationName
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      return {
        success: false,
        duration,
        error: error instanceof Error ? error.message : String(error),
        operation: operationName
      };
    }
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck(): Promise<SupabaseHealthCheck> {
    const timestamp = new Date().toISOString();
    const tests = await this.testAuthOperations();
    
    const passedTests = tests.filter(t => t.success).length;
    const avgResponseTime = tests.reduce((sum, t) => sum + t.duration, 0) / tests.length;
    const slowestTest = tests.reduce((slowest, current) => 
      current.duration > slowest.duration ? current : slowest
    );
    
    const overallHealth: SupabaseHealthCheck['overallHealth'] = 
      passedTests === tests.length ? 'healthy' :
      passedTests > 0 ? 'degraded' : 'unhealthy';

    const healthCheck: SupabaseHealthCheck = {
      timestamp,
      overallHealth,
      tests,
      summary: {
        totalTests: tests.length,
        passedTests,
        avgResponseTime,
        slowestOperation: slowestTest.operation,
        slowestDuration: slowestTest.duration
      }
    };

    // Log the health check results
    logger.info('Supabase health check completed', healthCheck);
    
    return healthCheck;
  }

  /**
   * Test specifically if signOut would hang (diagnostic only - doesn't actually sign out)
   */
  async diagnoseSignOutIssue(): Promise<{ likelyToHang: boolean; reason: string }> {
    console.log('🔍 SUPABASE_MONITOR: Testing if signOut would likely hang...');
    
    const healthCheck = await this.performHealthCheck();
    
    // Analyze results to predict signOut behavior
    const authTests = healthCheck.tests.filter(t => 
      t.operation === 'getSession' || t.operation === 'getUser'
    );
    
    const hasSlowAuth = authTests.some(t => t.duration > 3000);
    const hasFailedAuth = authTests.some(t => !t.success);
    const avgAuthTime = authTests.reduce((sum, t) => sum + t.duration, 0) / authTests.length;
    
    let likelyToHang = false;
    let reason = 'Connection appears healthy';
    
    if (hasFailedAuth) {
      likelyToHang = true;
      reason = 'Auth operations are failing, signOut likely to hang';
    } else if (hasSlowAuth) {
      likelyToHang = true;
      reason = `Auth operations are slow (avg: ${avgAuthTime.toFixed(0)}ms), signOut may hang`;
    } else if (avgAuthTime > 2000) {
      likelyToHang = true;
      reason = `Auth operations consistently slow (${avgAuthTime.toFixed(0)}ms), moderate hang risk`;
    }
    
    console.log('🔍 SUPABASE_MONITOR: Diagnosis:', { likelyToHang, reason });
    
    return { likelyToHang, reason };
  }
}

/**
 * Global monitor instance
 */
export const supabaseMonitor = new SupabaseMonitor();

/**
 * Quick health check function for easy use
 */
export const checkSupabaseHealth = () => supabaseMonitor.performHealthCheck();

/**
 * Quick diagnostic for signOut hanging issue
 */
export const diagnoseSignOutHang = () => supabaseMonitor.diagnoseSignOutIssue(); 