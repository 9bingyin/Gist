import { useEffect, useRef } from "react";

export interface ArticleUpdateEvent {
  feedId: string;
  newCount: number;
  updatedCount: number;
  timestamp: number;
}

interface UseArticleUpdatesOptions {
  onUpdate?: (event: ArticleUpdateEvent) => void;
  enabled?: boolean;
}

export function useArticleUpdates({
  onUpdate,
  enabled = true,
}: UseArticleUpdatesOptions = {}) {
  const onUpdateRef = useRef(onUpdate);
  const retryDelayRef = useRef(1000);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (!enabled) return;

    let eventSource: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      if (closed) return;
      eventSource = new EventSource("/api/articles/stream");

      eventSource.onmessage = (event) => {
        try {
          const data: ArticleUpdateEvent = JSON.parse(event.data);
          retryDelayRef.current = 1000;
          onUpdateRef.current?.(data);
        } catch {
          // Ignore parse errors (heartbeat)
        }
      };

      eventSource.onerror = () => {
        eventSource?.close();
        eventSource = null;
        if (closed) return;

        const delay = retryDelayRef.current;
        retryDelayRef.current = Math.min(delay * 2, 30000);
        retryTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      closed = true;
      eventSource?.close();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [enabled]);
}
