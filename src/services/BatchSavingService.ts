import { ScoreSubmission } from '../types';
import { DatabaseService } from './DatabaseService';

export class BatchSavingService {
  private batch: ScoreSubmission[] = [];
  private readonly batchSize: number;
  private readonly maxRetries: number = 3;
  private readonly retryDelay: number = 1000; // 1 second
  private dbService: DatabaseService;
  private saveInProgress: boolean = false;

  constructor(batchSize: number, dbService: DatabaseService) {
    this.batchSize = batchSize;
    this.dbService = dbService;
    
    // Set up graceful shutdown to save remaining batch
    process.on('SIGINT', () => this.gracefulShutdown());
    process.on('SIGTERM', () => this.gracefulShutdown());
  }

  /**
   * Add a score submission to the batch
   */
  async addToBatch(submission: ScoreSubmission): Promise<void> {
    this.batch.push(submission);
    console.log(
      `Score added to batch. Current batch size: ${this.batch.length}/${this.batchSize}`
    );

    if (this.batch.length >= this.batchSize) {
      await this.flushBatch();
    }
  }

  /**
   * Flush the current batch to the database with retry mechanism
   */
  async flushBatch(): Promise<void> {
    if (this.batch.length === 0 || this.saveInProgress) {
      return;
    }

    this.saveInProgress = true;
    const batchToSave = [...this.batch];
    this.batch = []; // Clear the batch immediately to accept new submissions

    console.log(`Flushing batch of ${batchToSave.length} records to database`);

    let attempt = 0;
    let success = false;

    while (attempt < this.maxRetries && !success) {
      try {
        await this.dbService.saveBatch(batchToSave);
        console.log(
          `Successfully saved batch of ${batchToSave.length} records (attempt ${attempt + 1})`
        );
        success = true;
      } catch (error) {
        attempt++;
        console.error(
          `Failed to save batch (attempt ${attempt}/${this.maxRetries}):`,
          error
        );

        if (attempt < this.maxRetries) {
          // Exponential backoff
          const delay = this.retryDelay * Math.pow(2, attempt - 1);
          console.log(`Retrying in ${delay}ms...`);
          await this.sleep(delay);
        } else {
          // All retries failed - save to a dead letter queue or file
          console.error(
            'All retry attempts failed. Saving to dead letter queue...'
          );
          await this.saveToDeadLetterQueue(batchToSave);
        }
      }
    }

    this.saveInProgress = false;
  }

  /**
   * Save failed batch to a dead letter queue for manual recovery
   */
  private async saveToDeadLetterQueue(
    batch: ScoreSubmission[]
  ): Promise<void> {
    try {
      // In a real system, this would save to a separate queue or persistent storage
      await this.dbService.saveToDeadLetterQueue(batch);
      console.log('Batch saved to dead letter queue for manual recovery');
    } catch (error) {
      console.error('Failed to save to dead letter queue:', error);
      // Last resort: log to file or external monitoring system
      console.error('CRITICAL: Lost batch data:', JSON.stringify(batch));
    }
  }

  /**
   * Get current batch size
   */
  getBatchSize(): number {
    return this.batch.length;
  }

  /**
   * Check if a save is in progress
   */
  isSaveInProgress(): boolean {
    return this.saveInProgress;
  }

  /**
   * Force flush the current batch (useful for graceful shutdown)
   */
  async forceFlush(): Promise<void> {
    if (this.batch.length > 0) {
      console.log('Force flushing remaining batch...');
      await this.flushBatch();
    }
  }

  /**
   * Graceful shutdown handler
   */
  private async gracefulShutdown(): Promise<void> {
    console.log('Graceful shutdown initiated...');
    
    // Wait for any in-progress save to complete
    while (this.saveInProgress) {
      console.log('Waiting for in-progress save to complete...');
      await this.sleep(100);
    }

    // Flush remaining batch
    await this.forceFlush();
    
    console.log('Batch saving service shut down gracefully');
  }

  /**
   * Helper method for async sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get statistics about the batch service
   */
  getStats(): {
    currentBatchSize: number;
    saveInProgress: boolean;
    batchThreshold: number;
  } {
    return {
      currentBatchSize: this.batch.length,
      saveInProgress: this.saveInProgress,
      batchThreshold: this.batchSize,
    };
  }
}

