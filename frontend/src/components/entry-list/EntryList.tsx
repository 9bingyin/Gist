import {
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { useTranslation } from "react-i18next";
import { useEntriesInfinite, useUnreadCounts } from "@/hooks/useEntries";
import { useFeeds } from "@/hooks/useFeeds";
import { useFolders } from "@/hooks/useFolders";
import { useAISettings } from "@/hooks/useAISettings";
import { useGeneralSettings } from "@/hooks/useGeneralSettings";
import { useSwipeGesture } from "@/hooks/useSwipeGesture";
import { selectionToParams, type SelectionType } from "@/hooks/useSelection";
import { flattenUniqueEntries } from "@/lib/entry-pagination";
import { stripHtml } from "@/lib/html-utils";
import { EntryListItem } from "./EntryListItem";
import { EntryListHeader } from "./EntryListHeader";
import { needsTranslation as needsTranslationAsync } from "@/lib/language-detect-async";
import {
  translateArticlesBatch,
  cancelAllBatchTranslations,
} from "@/services/translation-service";
import { translationActions } from "@/stores/translation-store";
import { selectionScrollKey, entryListScrollPositions } from "./scroll-key";
import { useScrollToTop } from "@/hooks/useScrollToTop";
import { MobileDocumentHeader } from "@/components/layout/MobileDocumentHeader";
import { cn } from "@/lib/utils";
import { useScrollMarkRead } from "./useScrollMarkRead";
import { useEntryListScrollSurface } from "./scroll-surface";
import type { Entry, Feed, Folder, ContentType } from "@/types/api";

interface EntryListProps {
  selection: SelectionType;
  selectedEntryId: string | null;
  onSelectEntry: (entryId: string) => void;
  onMarkAllRead: () => void;
  unreadOnly: boolean;
  onToggleUnreadOnly: () => void;
  contentType: ContentType;
  isMobile?: boolean;
  onMenuClick?: () => void;
  isTablet?: boolean;
  onToggleSidebar?: () => void;
  sidebarVisible?: boolean;
  isActive?: boolean;
}

export function EntryList({
  selection,
  selectedEntryId,
  onSelectEntry,
  onMarkAllRead,
  unreadOnly,
  onToggleUnreadOnly,
  contentType,
  isMobile,
  onMenuClick,
  isTablet,
  onToggleSidebar,
  sidebarVisible,
  isActive = true,
}: EntryListProps) {
  "use no memo";

  const { t } = useTranslation();
  const params = selectionToParams(selection, contentType);
  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const listWrapperRef = useRef<HTMLDivElement>(null);
  const usesDocumentScroll = Boolean(isMobile);
  const scrollSurface = useEntryListScrollSurface({
    documentScroll: usesDocumentScroll,
    containerRef,
    headerRef,
  });
  const scrollToTop = useCallback(() => {
    scrollSurface.scrollTo(0, "smooth");
  }, [scrollSurface]);

  useScrollToTop(scrollToTop, "entrylist", isActive);

  const handleMenuClick = useCallback(() => {
    entryListScrollPositions.set(
      selectionScrollKey(selection, contentType),
      scrollSurface.getScrollTop(),
    );
    onMenuClick?.();
  }, [contentType, onMenuClick, scrollSurface, selection]);

  const { data: feeds = [] } = useFeeds();
  const { data: folders = [] } = useFolders();
  const { data: aiSettings } = useAISettings();
  const { data: generalSettings } = useGeneralSettings();
  const { data: unreadCounts } = useUnreadCounts();
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useEntriesInfinite({ ...params, unreadOnly });

  // Swipe gesture: Right swipe opens sidebar (only on mobile)
  useSwipeGesture(listWrapperRef, {
    onSwipeRight: handleMenuClick,
    enabledDirections: ["right"],
    threshold: 100,
    preventScroll: true,
    startFrom: { left: 32 },
    enabled: Boolean(isMobile && onMenuClick),
  });

  // Track translated entries to avoid re-translating
  const translatedEntries = useRef(new Set<string>());
  const pendingTranslation = useRef(new Map<string, Entry>());
  const pendingDetection = useRef(new Set<string>());
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const translationSession = useRef(0);

  const autoTranslate = aiSettings?.autoTranslate ?? false;
  const targetLanguage = aiSettings?.summaryLanguage ?? "zh-CN";
  const markReadOnScroll = generalSettings?.markReadOnScroll ?? false;

  // Save/restore scroll position per selection+contentType
  const scrollKey = selectionScrollKey(selection, contentType);

  // Restore scroll position on same-mount key change (e.g., article -> notification)
  // and remount (e.g., returning from picture mode).
  useLayoutEffect(() => {
    if (!isActive) return;

    const saved = entryListScrollPositions.get(scrollKey);
    scrollSurface.scrollTo(saved ?? 0);
    return () => {
      entryListScrollPositions.set(scrollKey, scrollSurface.getScrollTop());
    };
  }, [isActive, scrollKey, scrollSurface]);

  const maybeFetchNextPage = useCallback(() => {
    if (!isActive || !hasNextPage || isFetchingNextPage) return;

    if (scrollSurface.getDistanceToBottom() <= 600) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isActive, isFetchingNextPage, scrollSurface]);

  const handleSelectEntry = useCallback(
    (entryId: string) => {
      entryListScrollPositions.set(scrollKey, scrollSurface.getScrollTop());
      onSelectEntry(entryId);
    },
    [onSelectEntry, scrollKey, scrollSurface],
  );

  useEffect(() => {
    if (!isActive) return;

    const handleScroll = () => {
      entryListScrollPositions.set(scrollKey, scrollSurface.getScrollTop());
      maybeFetchNextPage();
    };

    return scrollSurface.subscribe(handleScroll);
  }, [isActive, maybeFetchNextPage, scrollKey, scrollSurface]);

  // Cancel pending translations and reset state when list changes
  useEffect(() => {
    // Cancel any in-flight batch translations
    cancelAllBatchTranslations();
    // Clear translation tracking for new list
    translationSession.current += 1;
    translatedEntries.current.clear();
    pendingTranslation.current.clear();
    pendingDetection.current.clear();
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
  }, [selection, contentType]);

  useEffect(() => {
    const pendingDetectionEntries = pendingDetection.current;

    return () => {
      translationSession.current += 1;
      pendingDetectionEntries.clear();
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
    };
  }, []);

  const feedsMap = useMemo(() => {
    const map = new Map<string, Feed>();
    for (const feed of feeds) {
      map.set(feed.id, feed);
    }
    return map;
  }, [feeds]);

  const foldersMap = useMemo(() => {
    const map = new Map<string, Folder>();
    for (const folder of folders) {
      map.set(folder.id, folder);
    }
    return map;
  }, [folders]);

  const entries = useMemo(() => flattenUniqueEntries(data?.pages), [data]);
  const { endPaddingHeight: scrollReadEndPaddingHeight } = useScrollMarkRead({
    surface: scrollSurface,
    contentRootRef: containerRef,
    entries,
    enabled: markReadOnScroll && isActive,
    unreadOnly,
    hasNextPage: Boolean(hasNextPage),
    resetKey: `${scrollKey}\u0000${unreadOnly}\u0000${markReadOnScroll}`,
  });

  useEffect(() => {
    maybeFetchNextPage();
  }, [entries.length, maybeFetchNextPage]);

  // Function to trigger batch translation for pending entries
  const triggerBatchTranslation = useCallback(() => {
    if (pendingTranslation.current.size === 0) return;

    const articlesToTranslate = Array.from(pendingTranslation.current.values())
      .filter((entry) => !translatedEntries.current.has(entry.id))
      .map((entry) => ({
        id: entry.id,
        title: entry.title || "",
        summary: entry.content ? stripHtml(entry.content).slice(0, 200) : null,
      }));

    // Mark as translated to prevent re-translating
    for (const article of articlesToTranslate) {
      translatedEntries.current.add(article.id);
    }

    pendingTranslation.current.clear();

    if (articlesToTranslate.length > 0) {
      translateArticlesBatch(articlesToTranslate, targetLanguage).finally(
        () => {
          // Remove entries that didn't actually get translated (cancelled, partial failure, etc.)
          for (const article of articlesToTranslate) {
            const cached = translationActions.get(article.id, targetLanguage);
            if (!cached?.title && !cached?.summary) {
              translatedEntries.current.delete(article.id);
            }
          }
        },
      );
    }
  }, [targetLanguage]);

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

  // Schedule entry for translation when visible
  const scheduleTranslation = useCallback(
    (entry: Entry) => {
      if (!autoTranslate) return;
      if (translatedEntries.current.has(entry.id)) {
        // Verify against store: if marked but no actual translation, allow retry
        const cached = translationActions.get(entry.id, targetLanguage);
        if (cached?.title || cached?.summary) return;
        translatedEntries.current.delete(entry.id);
      }
      // Skip if user manually disabled translation for this article
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

  // Trigger translation for real visible items and selected entry
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

    if (selectedEntryId) {
      const selectedEntry = entries.find((e) => e.id === selectedEntryId);
      if (selectedEntry) {
        scheduleTranslation(selectedEntry);
      }
    }

    return () => {
      observer.disconnect();
    };
  }, [
    entries,
    autoTranslate,
    isActive,
    scheduleTranslation,
    scrollSurface,
    selectedEntryId,
  ]);

  const title = useMemo(() => {
    switch (selection.type) {
      case "all":
        switch (contentType) {
          case "picture":
            return t("entry_list.all_pictures");
          case "notification":
            return t("entry_list.all_notifications");
          default:
            return t("entry_list.all_articles");
        }
      case "feed":
        return feedsMap.get(selection.feedId)?.title || t("entry_list.feed");
      case "folder":
        return (
          foldersMap.get(selection.folderId)?.name || t("entry_list.folder")
        );
      case "starred":
        return t("entry_list.starred");
    }
  }, [selection, contentType, feedsMap, foldersMap, t]);

  // Calculate unread count from API data (not from loaded entries)
  const unreadCount = useMemo(() => {
    if (!unreadCounts) return 0;
    const counts = unreadCounts.counts;
    switch (selection.type) {
      case "all":
        // Sum all feeds' unread counts, filtered by contentType
        return feeds
          .filter((f) => f.type === contentType)
          .reduce((sum, f) => sum + (counts[f.id] ?? 0), 0);
      case "feed":
        return counts[selection.feedId] ?? 0;
      case "folder":
        // Sum unread counts for feeds in this folder with matching contentType
        return feeds
          .filter(
            (f) => f.folderId === selection.folderId && f.type === contentType,
          )
          .reduce((sum, f) => sum + (counts[f.id] ?? 0), 0);
      case "starred":
        return 0; // Starred view doesn't show unread count
    }
  }, [unreadCounts, selection, feeds, contentType]);

  return (
    <div
      ref={listWrapperRef}
      className={cn(
        usesDocumentScroll
          ? "entry-list-document min-h-[var(--app-dvh)]"
          : "flex h-full flex-col",
      )}
    >
      <MobileDocumentHeader
        enabled={usesDocumentScroll}
        headerRef={headerRef}
        testId="entry-list-header"
      >
        <EntryListHeader
          title={title}
          unreadCount={unreadCount}
          unreadOnly={unreadOnly}
          onToggleUnreadOnly={onToggleUnreadOnly}
          onMarkAllRead={onMarkAllRead}
          scrollToTopScope="entrylist"
          isMobile={isMobile}
          onMenuClick={handleMenuClick}
          isTablet={isTablet}
          onToggleSidebar={onToggleSidebar}
          sidebarVisible={sidebarVisible}
        />
      </MobileDocumentHeader>

      <div
        className={cn(
          usesDocumentScroll
            ? "min-h-[calc(var(--app-dvh)-3.5rem)]"
            : "relative min-h-0 flex-1 overflow-hidden",
        )}
      >
        <div
          ref={containerRef}
          data-testid="entry-list-viewport"
          className={cn(
            "w-full overflow-x-hidden rounded-[inherit] [overflow-anchor:none]",
            usesDocumentScroll
              ? "overflow-y-visible"
              : "h-full overflow-y-auto overscroll-y-contain",
          )}
        >
          {isLoading ? (
            <EntryListSkeleton />
          ) : entries.length === 0 ? (
            <EntryListEmpty />
          ) : (
            <div className="w-full">
              {entries.map((entry, index) => (
                <EntryListItem
                  key={entry.id}
                  data-index={index}
                  data-entry-id={entry.id}
                  entry={entry}
                  feed={feedsMap.get(entry.feedId)}
                  isSelected={entry.id === selectedEntryId}
                  onClick={() => handleSelectEntry(entry.id)}
                  autoTranslate={autoTranslate}
                  targetLanguage={targetLanguage}
                />
              ))}
              {scrollReadEndPaddingHeight > 0 && (
                <div
                  aria-hidden="true"
                  style={{ height: scrollReadEndPaddingHeight }}
                />
              )}
            </div>
          )}

          {isFetchingNextPage && <LoadingMore />}
        </div>
      </div>
    </div>
  );
}

function EntryListSkeleton() {
  return (
    <div className="space-y-px">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="px-4 py-3 animate-pulse">
          {/* Line 1: icon + feed name + time */}
          <div className="flex items-center gap-1.5">
            <div className="size-4 rounded bg-muted" />
            <div className="h-3 w-24 rounded bg-muted" />
            <div className="h-3 w-12 rounded bg-muted" />
          </div>
          {/* Line 2: title */}
          <div className="mt-1 h-4 w-3/4 rounded bg-muted" />
          {/* Line 3: summary */}
          <div className="mt-1 h-3 w-full rounded bg-muted" />
          <div className="mt-1 h-3 w-2/3 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function EntryListEmpty() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {t("entry_list.no_articles")}
    </div>
  );
}

function LoadingMore() {
  return (
    <div className="flex items-center justify-center py-4">
      <svg
        className="size-5 animate-spin text-muted-foreground"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    </div>
  );
}
