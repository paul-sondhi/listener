/**
 * Concurrency Control Utilities
 * 
 * Provides semaphore-based concurrency control for limiting simultaneous
 * operations, particularly useful for API rate limiting.
 */

/**
 * A semaphore implementation for controlling concurrent access to resources
 */
export class Semaphore {
  private permits: number;
  private waitQueue: Array<() => void> = [];

  /**
   * Create a new semaphore with the specified number of permits
   * @param permits - Maximum number of concurrent operations allowed
   */
  constructor(permits: number) {
    if (permits <= 0) {
      throw new Error('Semaphore permits must be greater than 0');
    }
    this.permits = permits;
  }

  /**
   * Acquire a permit, waiting if necessary
   * @returns Promise that resolves when a permit is acquired
   */
  async acquire(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.permits > 0) {
        this.permits--;
        resolve();
      } else {
        this.waitQueue.push(resolve);
      }
    });
  }

  /**
   * Release a permit, allowing waiting operations to proceed
   */
  release(): void {
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift();
      if (next) {
        next();
      }
    } else {
      this.permits++;
    }
  }

  /**
   * Get the current number of available permits
   */
  getAvailablePermits(): number {
    return this.permits;
  }

  /**
   * Get the number of operations waiting for permits
   */
  getQueueLength(): number {
    return this.waitQueue.length;
  }
}

/**
 * Process an array of items with controlled concurrency
 * 
 * @param items - Array of items to process
 * @param processor - Function to process each item
 * @param maxConcurrency - Maximum number of concurrent operations
 * @returns Promise that resolves to array of results
 */
export async function processWithConcurrency<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  maxConcurrency: number
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  if (maxConcurrency <= 0) {
    throw new Error('maxConcurrency must be greater than 0');
  }

  const semaphore = new Semaphore(maxConcurrency);
  const results: R[] = new Array(items.length);
  
  // Create promises for all items
  const promises = items.map(async (item, index) => {
    await semaphore.acquire();
    try {
      const result = await processor(item, index);
      results[index] = result;
      return result;
    } finally {
      semaphore.release();
    }
  });

  // Wait for all promises to complete
  await Promise.allSettled(promises);
  
  return results;
}

/**
 * Process an array of items with controlled concurrency, handling errors gracefully
 * 
 * @param items - Array of items to process
 * @param processor - Function to process each item
 * @param maxConcurrency - Maximum number of concurrent operations
 * @returns Promise that resolves to array of results (successful) and errors
 */
export async function processWithConcurrencySettled<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  maxConcurrency: number
): Promise<{
  results: (R | null)[];
  errors: (Error | null)[];
  successCount: number;
  errorCount: number;
}> {
  if (items.length === 0) {
    return {
      results: [],
      errors: [],
      successCount: 0,
      errorCount: 0
    };
  }

  if (maxConcurrency <= 0) {
    throw new Error('maxConcurrency must be greater than 0');
  }

  const semaphore = new Semaphore(maxConcurrency);
  const results: (R | null)[] = new Array(items.length).fill(null);
  const errors: (Error | null)[] = new Array(items.length).fill(null);
  
  // Create promises for all items
  const promises = items.map(async (item, index) => {
    await semaphore.acquire();
    try {
      const result = await processor(item, index);
      results[index] = result;
      return { success: true, result, error: null };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      errors[index] = err;
      return { success: false, result: null, error: err };
    } finally {
      semaphore.release();
    }
  });

  // Wait for all promises to complete
  const settled = await Promise.allSettled(promises);
  
  let successCount = 0;
  let errorCount = 0;
  
  settled.forEach((settlement, index) => {
    if (settlement.status === 'fulfilled') {
      if (settlement.value.success) {
        successCount++;
      } else {
        errorCount++;
      }
    } else {
      // Promise itself was rejected (shouldn't happen with our wrapper, but handle it)
      errors[index] = new Error(`Promise rejected: ${settlement.reason}`);
      errorCount++;
    }
  });
  
  return {
    results,
    errors,
    successCount,
    errorCount
  };
}

/**
 * A pool for managing concurrent operations with progress tracking
 */
export class ConcurrencyPool<T, R> {
  private semaphore: Semaphore;
  private activeOperations = 0;
  private completedOperations = 0;
  private totalOperations = 0;
  private startTime: number = 0;

  constructor(maxConcurrency: number) {
    this.semaphore = new Semaphore(maxConcurrency);
  }

  /**
   * Process items with the pool, providing progress callbacks
   * 
   * @param items - Items to process
   * @param processor - Function to process each item
   * @param onProgress - Optional progress callback
   * @returns Promise resolving to results
   */
  async process(
    items: T[],
    processor: (item: T, index: number) => Promise<R>,
    onProgress?: (progress: {
      completed: number;
      total: number;
      active: number;
      percentage: number;
      elapsedMs: number;
      estimatedRemainingMs: number;
    }) => void
  ): Promise<{
    results: (R | null)[];
    errors: (Error | null)[];
    successCount: number;
    errorCount: number;
    totalElapsedMs: number;
  }> {
    this.totalOperations = items.length;
    this.completedOperations = 0;
    this.activeOperations = 0;
    this.startTime = Date.now();

    if (items.length === 0) {
      return {
        results: [],
        errors: [],
        successCount: 0,
        errorCount: 0,
        totalElapsedMs: 0
      };
    }

    const results: (R | null)[] = new Array(items.length).fill(null);
    const errors: (Error | null)[] = new Array(items.length).fill(null);

    const processItem = async (item: T, index: number): Promise<void> => {
      await this.semaphore.acquire();
      this.activeOperations++;
      
      try {
        const result = await processor(item, index);
        results[index] = result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors[index] = err;
      } finally {
        this.semaphore.release();
        this.activeOperations--;
        this.completedOperations++;
        
        // Call progress callback if provided
        if (onProgress) {
          const elapsedMs = Date.now() - this.startTime;
          const percentage = (this.completedOperations / this.totalOperations) * 100;
          const avgTimePerItem = elapsedMs / this.completedOperations;
          const remainingItems = this.totalOperations - this.completedOperations;
          const estimatedRemainingMs = avgTimePerItem * remainingItems;
          
          onProgress({
            completed: this.completedOperations,
            total: this.totalOperations,
            active: this.activeOperations,
            percentage,
            elapsedMs,
            estimatedRemainingMs
          });
        }
      }
    };

    // Start all operations
    const promises = items.map((item, index) => processItem(item, index));
    
    // Wait for all to complete
    await Promise.allSettled(promises);
    
    const successCount = results.filter(r => r !== null).length;
    const errorCount = errors.filter(e => e !== null).length;
    const totalElapsedMs = Date.now() - this.startTime;

    return {
      results,
      errors,
      successCount,
      errorCount,
      totalElapsedMs
    };
  }

  /**
   * Get current pool statistics
   */
  getStats(): {
    active: number;
    completed: number;
    total: number;
    availablePermits: number;
    queueLength: number;
  } {
    return {
      active: this.activeOperations,
      completed: this.completedOperations,
      total: this.totalOperations,
      availablePermits: this.semaphore.getAvailablePermits(),
      queueLength: this.semaphore.getQueueLength()
    };
  }
} 