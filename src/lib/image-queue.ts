export class ImageQueueCancelledError extends Error {
  constructor() {
    super("Image request cancelled");
    this.name = "ImageQueueCancelledError";
  }
}

interface QueueItem {
  id: number;
  url: string;
  resolve: (blob: Blob) => void;
  reject: (error: Error) => void;
}

export interface FetchResult {
  promise: Promise<Blob>;
  cancel: () => void;
}

// Track shared URL requests with reference counting
interface SharedRequest {
  promise: Promise<Blob>;
  refCount: number;
  controller: AbortController;
}

class ImageQueue {
  private maxConcurrent = 4;
  private queue: QueueItem[] = [];
  private activeCount = 0;
  private nextId = 0;
  // Track active requests by unique ID
  private activeRequests = new Map<number, AbortController>();
  // Track shared URL requests for deduplication
  private urlRequests = new Map<string, SharedRequest>();

  fetch(url: string): FetchResult {
    // Check if there's already a request for this URL
    const existing = this.urlRequests.get(url);
    if (existing) {
      existing.refCount++;
      return {
        promise: existing.promise,
        cancel: () => {
          existing.refCount--;
          if (existing.refCount <= 0) {
            this.cancelUrl(url);
          }
        },
      };
    }

    const itemId = this.nextId++;
    const controller = new AbortController();
    let queueItem: QueueItem | null = null;

    const promise = new Promise<Blob>((resolve, reject) => {
      queueItem = { id: itemId, url, resolve, reject };
      this.queue.push(queueItem);
    });

    // Create shared request entry BEFORE calling processQueue
    const sharedRequest: SharedRequest = {
      promise,
      refCount: 1,
      controller,
    };
    this.urlRequests.set(url, sharedRequest);

    // Now process the queue
    this.processQueue();

    const cancel = () => {
      const shared = this.urlRequests.get(url);
      if (shared) {
        shared.refCount--;
        if (shared.refCount <= 0) {
          this.cancelUrl(url);
        }
      }
    };

    return { promise, cancel };
  }

  private cancelUrl(url: string) {
    const shared = this.urlRequests.get(url);
    if (!shared) return;

    // Remove from queue if still queued
    const queueIndex = this.queue.findIndex((item) => item.url === url);
    if (queueIndex !== -1) {
      const item = this.queue[queueIndex];
      this.queue.splice(queueIndex, 1);
      item.reject(new ImageQueueCancelledError());
      this.urlRequests.delete(url);
      return;
    }

    // Abort if in progress
    shared.controller.abort();
    this.urlRequests.delete(url);
  }

  clear() {
    // Reject all queued requests
    for (const item of this.queue) {
      item.reject(new ImageQueueCancelledError());
    }
    this.queue = [];

    // Abort all active requests
    for (const controller of this.activeRequests.values()) {
      controller.abort();
    }
    this.activeRequests.clear();
    this.urlRequests.clear();
  }

  private processQueue() {
    if (this.activeCount >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const item = this.queue.shift();
    if (!item) return;

    const shared = this.urlRequests.get(item.url);
    if (!shared) {
      // Request was cancelled before processing, try next item
      this.processQueue();
      return;
    }

    this.activeCount++;
    this.activeRequests.set(item.id, shared.controller);

    fetch(item.url, { signal: shared.controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load image: ${response.status}`);
        }
        return response.blob();
      })
      .then((blob) => {
        item.resolve(blob);
      })
      .catch((error) => {
        if (error instanceof Error && error.name === "AbortError") {
          item.reject(new ImageQueueCancelledError());
        } else {
          item.reject(error instanceof Error ? error : new Error(String(error)));
        }
      })
      .finally(() => {
        this.activeRequests.delete(item.id);
        this.urlRequests.delete(item.url);
        this.activeCount--;
        this.processQueue();
      });
  }
}

export const imageQueue = new ImageQueue();
