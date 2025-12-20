import { prisma } from "@/lib/db";

/**
 * Global AI rate limiter to prevent API rate limit errors
 * Uses a simple queue-based approach with minimum interval between requests
 */

interface QueueItem {
  resolve: () => void;
  reject: (error: Error) => void;
}

class AIRateLimiter {
  private queue: QueueItem[] = [];
  private isProcessing = false;
  private lastRequestTime = 0;
  private minInterval: number; // minimum ms between requests
  private maxQueueSize: number;
  private requestTimeout: number;
  private lastSettingsCheck = 0;
  private settingsCacheDuration = 5000; // Check settings every 5 seconds

  constructor(options?: {
    minInterval?: number;
    maxQueueSize?: number;
    requestTimeout?: number;
  }) {
    this.minInterval = options?.minInterval ?? 500; // 500ms between requests
    this.maxQueueSize = options?.maxQueueSize ?? 50;
    this.requestTimeout = options?.requestTimeout ?? 60000; // 60s timeout
  }

  /**
   * Load QPS setting from database
   */
  private async loadQpsSetting(): Promise<void> {
    const now = Date.now();
    if (now - this.lastSettingsCheck < this.settingsCacheDuration) {
      return;
    }

    try {
      const setting = await prisma.setting.findUnique({
        where: { key: "aiQps" },
      });

      if (setting) {
        const qps = parseFloat(setting.value);
        if (!isNaN(qps) && qps > 0) {
          this.minInterval = Math.round(1000 / qps);
        }
      }

      this.lastSettingsCheck = now;
    } catch {
      // Ignore errors, use cached value
    }
  }

  /**
   * Wait for rate limit slot before making AI request
   */
  async acquire(): Promise<void> {
    // Load latest QPS setting
    await this.loadQpsSetting();

    // Check queue size
    if (this.queue.length >= this.maxQueueSize) {
      throw new Error("Too many pending AI requests. Please try again later.");
    }

    return new Promise<void>((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout>;
      const item: QueueItem = {
        resolve: () => {
          clearTimeout(timeoutId);
          resolve();
        },
        reject: (error: Error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
      };

      // Set timeout for this request
      timeoutId = setTimeout(() => {
        const index = this.queue.indexOf(item);
        if (index !== -1) {
          this.queue.splice(index, 1);
        }
        item.reject(new Error("AI request timeout. Please try again."));
      }, this.requestTimeout);

      this.queue.push(item);
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      const waitTime = Math.max(0, this.minInterval - timeSinceLastRequest);

      if (waitTime > 0) {
        await this.sleep(waitTime);
      }

      const item = this.queue.shift();
      if (item) {
        this.lastRequestTime = Date.now();
        item.resolve();
      }
    }

    this.isProcessing = false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current queue length
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Update rate limit settings
   */
  setMinInterval(ms: number): void {
    this.minInterval = ms;
  }
}

// Global singleton instance
export const aiRateLimiter = new AIRateLimiter({
  minInterval: 500, // 500ms between requests (max 2 requests per second)
  maxQueueSize: 50,
  requestTimeout: 60000,
});

/**
 * Wrapper function to execute AI request with rate limiting
 */
export async function withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  await aiRateLimiter.acquire();
  return fn();
}
