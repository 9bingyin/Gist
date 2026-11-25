import { useCallback, useEffect, useRef } from "react";
import { stripHtml } from "@/lib/html-utils";
import { needsTranslation as needsTranslationAsync } from "@/lib/language-detect-async";
import { translateArticlesBatch } from "@/services/translation-service";
import { translationActions } from "@/stores/translation-store";
import type { ContentType, Entry } from "@/types/api";
import type { SelectionType } from "@/hooks/useSelection";
import type { ScrollSurface } from "./scroll-surface";

interface UseListAutoTranslationOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  scrollSurface: ScrollSurface;
  entries: Entry[];
  selectedEntryId: string | null;
  selection: SelectionType;
  contentType: ContentType;
  autoTranslate: boolean;
  targetLanguage: string;
  isActive: boolean;
}

export function useListAutoTranslation({
  containerRef,
  scrollSurface,
  entries,
  selectedEntryId,
  selection,
  contentType,
  autoTranslate,
  targetLanguage,
  isActive,
}: UseListAutoTranslationOptions): void {
  const translatedEntries = useRef(new Set<string>());
  const pendingTranslation = useRef(new Map<string, Entry>());
  const pendingDetection = useRef(new Set<string>());
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const translationSession = useRef(0);
  const batchAbortRef = useRef<AbortController | null>(null);

  const cancelListBatch = useCallback(() => {
    batchAbortRef.current?.abort();
    batchAbortRef.current = null;
  }, []);

  // Cancel pending translations and reset state when list changes
  useEffect(() => {
    cancelListBatch();
    translationSession.current += 1;
    translatedEntries.current.clear();
    pendingTranslation.current.clear();
    pendingDetection.current.clear();
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
  }, [selection, contentType, cancelListBatch]);

  // Cleanup on unmount
  useEffect(() => {
    const pendingDetectionEntries = pendingDetection.current;

    return () => {
      cancelListBatch();
      translationSession.current += 1;
      pendingDetectionEntries.clear();
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
    };
  }, [cancelListBatch]);

  const triggerBatchTranslation = useCallback(() => {
    if (pendingTranslation.current.size === 0) return;

    const articlesToTranslate = Array.from(pendingTranslation.current.values())
      .filter((entry) => !translatedEntries.current.has(entry.id))
      .map((entry) => ({
        id: entry.id,
        title: entry.title || "",
        summary: entry.content ? stripHtml(entry.content).slice(0, 200) : null,
      }));

    for (const article of articlesToTranslate) {
      translatedEntries.current.add(article.id);
    }

    pendingTranslation.current.clear();

    if (articlesToTranslate.length > 0) {
      cancelListBatch();
      const controller = new AbortController();
      batchAbortRef.current = controller;

      translateArticlesBatch(
        articlesToTranslate,
        targetLanguage,
        controller.signal,
      )
        .catch(() => {})
        .finally(() => {
          if (batchAbortRef.current === controller) {
            batchAbortRef.current = null;
          }
          for (const article of articlesToTranslate) {
            const cached = translationActions.get(article.id, targetLanguage);
            if (!cached?.title && !cached?.summary) {
              translatedEntries.current.delete(article.id);
            }
          }
        });
    }
  }, [targetLanguage, cancelListBatch]);

  const queueEntryForTranslation = useCallback(
    (entry: Entry) => {
      pendingTranslation.current.set(entry.id, entry);

      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      debounceTimer.current = setTimeout(triggerBatchTranslation, 500);
    },
    [triggerBatchTranslation],
  );

  const scheduleTranslation = useCallback(
    (entry: Entry) => {
      if (!autoTranslate) return;
      if (translatedEntries.current.has(entry.id)) {
        const cached = translationActions.get(entry.id, targetLanguage);
        if (cached?.title || cached?.summary) return;
        translatedEntries.current.delete(entry.id);
      }
      if (translationActions.isDisabled(entry.id)) return;

      if (
        pendingTranslation.current.has(entry.id) ||
        pendingDetection.current.has(entry.id)
      ) {
        return;
      }

      const summary = entry.content
        ? stripHtml(entry.content).slice(0, 200)
        : null;
      const session = translationSession.current;
      pendingDetection.current.add(entry.id);

      void needsTranslationAsync(entry.title || "", summary, targetLanguage)
        .then((shouldTranslate) => {
          if (translationSession.current !== session) return;

          if (!shouldTranslate) {
            translatedEntries.current.add(entry.id);
            return;
          }

          queueEntryForTranslation(entry);
        })
        .catch(() => {
          if (translationSession.current !== session) return;
          queueEntryForTranslation(entry);
        })
        .finally(() => {
          if (translationSession.current === session) {
            pendingDetection.current.delete(entry.id);
          }
        });
    },
    [autoTranslate, targetLanguage, queueEntryForTranslation],
  );

  // Observe visible list items without depending on selectedEntryId
  useEffect(() => {
    if (!autoTranslate || !isActive) return;

    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      for (const entry of entries.slice(0, 20)) {
        scheduleTranslation(entry);
      }
      return;
    }

    const observer = new IntersectionObserver(
      (items) => {
        for (const item of items) {
          if (!item.isIntersecting) continue;

          const index = Number((item.target as HTMLElement).dataset.index);
          const entry = entries[index];
          if (entry) {
            scheduleTranslation(entry);
          }
        }
      },
      {
        root: scrollSurface.getIntersectionRoot(),
        rootMargin: "200px 0px",
      },
    );

    for (const item of node.querySelectorAll<HTMLElement>("[data-index]")) {
      observer.observe(item);
    }

    return () => {
      observer.disconnect();
    };
  }, [
    containerRef,
    entries,
    autoTranslate,
    isActive,
    scheduleTranslation,
    scrollSurface,
  ]);

  // Separate effect for selected entry so clicking an article never rebuilds IntersectionObserver
  useEffect(() => {
    if (!autoTranslate || !isActive || !selectedEntryId) return;

    const selectedEntry = entries.find((e) => e.id === selectedEntryId);
    if (selectedEntry) {
      scheduleTranslation(selectedEntry);
    }
  }, [autoTranslate, isActive, selectedEntryId, entries, scheduleTranslation]);
}
