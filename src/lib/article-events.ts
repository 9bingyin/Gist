/**
 * Article update event emitter for real-time push notifications
 */

import { EventEmitter } from "events";

export interface ArticleUpdateEvent {
  feedId: string;
  newCount: number;
  updatedCount: number;
  timestamp: number;
}

class ArticleEventEmitter extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
  }

  notifyUpdate(feedId: string, newCount: number, updatedCount: number) {
    if (newCount > 0 || updatedCount > 0) {
      const event: ArticleUpdateEvent = {
        feedId,
        newCount,
        updatedCount,
        timestamp: Date.now(),
      };
      this.emit("articles:updated", event);
    }
  }
}

const globalForEvents = globalThis as unknown as {
  articleEvents: ArticleEventEmitter | undefined;
};

export const articleEvents =
  globalForEvents.articleEvents ?? new ArticleEventEmitter();

if (process.env.NODE_ENV !== "production") {
  globalForEvents.articleEvents = articleEvents;
}
