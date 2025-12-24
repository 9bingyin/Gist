export class ImageQueueCancelledError extends Error {
  constructor() {
    super("Image request cancelled");
    this.name = "ImageQueueCancelledError";
  }
}

interface QueueItem {
  url: string;
  resolve: (blob: Blob) => void;
  reject: (error: Error) => void;
}

export interface FetchResult {
  promise: Promise<Blob>;
  cancel: () => void;
}

class ImageQueue {
  private maxConcurrent = 4;
  private queue: QueueItem[] = [];
  private activeCount = 0;
  private activeRequests = new Map<string, AbortController>();

  fetch(url: string): FetchResult {
    let queueItem: QueueItem | null = null;

    const promise = new Promise<Blob>((resolve, reject) => {
      queueItem = { url, resolve, reject };
      this.queue.push(queueItem);
      this.processQueue();
    });

    const cancel = () => {
      if (!queueItem) return;

      // Try to remove from queue first
      const index = this.queue.indexOf(queueItem);
      if (index !== -1) {
        this.queue.splice(index, 1);
        return;
      }

      // If already in progress, abort it
      const controller = this.activeRequests.get(url);
      if (controller) {
        controller.abort();
      }
    };

    return { promise, cancel };
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
  }

  private processQueue() {
    if (this.activeCount >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const item = this.queue.shift();
    if (!item) return;

    this.activeCount++;
    const controller = new AbortController();
    this.activeRequests.set(item.url, controller);

    fetch(item.url, { signal: controller.signal })
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
        this.activeRequests.delete(item.url);
        this.activeCount--;
        this.processQueue();
      });
  }
}

export const imageQueue = new ImageQueue();
