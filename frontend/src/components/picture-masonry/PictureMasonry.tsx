import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { VirtuosoMasonry } from "@virtuoso.dev/masonry";
import { useEntriesInfinite, useUnreadCounts } from "@/hooks/useEntries";
import { useFeeds } from "@/hooks/useFeeds";
import { useFolders } from "@/hooks/useFolders";
import { useMasonryColumn } from "@/hooks/useMasonryColumn";
import { useSwipeGesture } from "@/hooks/useSwipeGesture";
import { selectionToParams, type SelectionType } from "@/hooks/useSelection";
import { flattenUniqueEntries } from "@/lib/entry-pagination";
import { cn } from "@/lib/utils";
import { useImageDimensionsStore } from "@/stores/image-dimensions-store";
import { PictureItem } from "./PictureItem";
import { useGeneralSettings } from "@/hooks/useGeneralSettings";
import { useScrollToTop } from "@/hooks/useScrollToTop";
import { useMasonryScrollMarkRead } from "./useMasonryScrollMarkRead";
import { EntryListHeader } from "@/components/entry-list/EntryListHeader";
import { MobileDocumentHeader } from "@/components/layout/MobileDocumentHeader";
import { useEntryListScrollSurface } from "@/components/entry-list/scroll-surface";
import type { ContentType, Entry, Feed } from "@/types/api";

interface PictureMasonryProps {
  selection: SelectionType;
  contentType: ContentType;
  unreadOnly: boolean;
  onToggleUnreadOnly: () => void;
  onMarkAllRead: () => void;
  isMobile?: boolean;
  onMenuClick?: () => void;
  isTablet?: boolean;
  onToggleSidebar?: () => void;
  sidebarVisible?: boolean;
}

interface MasonryItem {
  entry: Entry;
  feed?: Feed;
}

function getSelectionKey(selection: SelectionType): string {
  switch (selection.type) {
    case "feed":
      return selection.feedId;
    case "folder":
      return selection.folderId;
    case "all":
    case "starred":
      return selection.type;
  }
}

function findScrollableElement(root: HTMLElement | null): HTMLElement | null {
  if (!root) return null;

  const candidates = [
    root,
    ...Array.from(root.querySelectorAll<HTMLElement>("*")),
  ];
  return (
    candidates.find((element) => {
      const { overflowY } = getComputedStyle(element);
      return overflowY === "auto" || overflowY === "scroll";
    }) ?? null
  );
}

function MasonryItemContent({ data: item }: { data: MasonryItem }) {
  if (!item?.entry) return null;
  return (
    <div data-entry-id={item.entry.id}>
      <PictureItem entry={item.entry} feed={item.feed} />
    </div>
  );
}

export function PictureMasonry({
  selection,
  contentType,
  unreadOnly,
  onToggleUnreadOnly,
  onMarkAllRead,
  isMobile,
  onMenuClick,
  isTablet,
  onToggleSidebar,
  sidebarVisible,
}: PictureMasonryProps) {
  const { t } = useTranslation();
  const params = selectionToParams(selection, contentType);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollElementRef = useRef<HTMLElement>(null);
  const [internalScroller, setInternalScroller] = useState<HTMLElement | null>(
    null,
  );
  const usesDocumentScroll = Boolean(isMobile);
  const scrollElement = usesDocumentScroll
    ? document.documentElement
    : internalScroller;
  const scrollSurface = useEntryListScrollSurface({
    documentScroll: usesDocumentScroll,
    containerRef: scrollElementRef,
    headerRef,
  });
  const scrollToTop = useCallback(() => {
    scrollSurface.scrollTo(0, "smooth");
  }, [scrollSurface]);

  useScrollToTop(scrollToTop, "picture");

  // Swipe gesture: Right swipe opens sidebar (only on mobile)
  useSwipeGesture(wrapperRef, {
    onSwipeRight: () => onMenuClick?.(),
    enabledDirections: ["right"],
    threshold: 100,
    preventScroll: true,
    startFrom: { left: 32 },
    enabled: Boolean(isMobile && onMenuClick),
  });

  const { currentColumn, isReady } = useMasonryColumn(
    isMobile,
    scrollContainerRef,
  );
  const loadFromDB = useImageDimensionsStore((state) => state.loadFromDB);
  const clearFailed = useImageDimensionsStore((state) => state.clearFailed);

  const { data: feeds = [] } = useFeeds();
  const { data: folders = [] } = useFolders();
  const { data: unreadCounts } = useUnreadCounts();
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useEntriesInfinite({
      ...params,
      unreadOnly,
      hasThumbnail: true,
    });
  const { data: generalSettings } = useGeneralSettings();
  const markReadOnScroll = generalSettings?.markReadOnScroll ?? false;

  const feedsMap = useMemo(() => {
    const map = new Map<string, Feed>();
    for (const feed of feeds) {
      map.set(feed.id, feed);
    }
    return map;
  }, [feeds]);

  const foldersMap = useMemo(() => {
    const map = new Map<string, { name: string }>();
    for (const folder of folders) {
      map.set(folder.id, folder);
    }
    return map;
  }, [folders]);

  const entries = useMemo(() => flattenUniqueEntries(data?.pages), [data]);

  const filterKey = useMemo(
    () => `${getSelectionKey(selection)}-${unreadOnly}`,
    [selection, unreadOnly],
  );

  // Clear failed images on mount and when filter context changes,
  // giving images a fresh chance to load (failures are often transient)
  useEffect(() => {
    clearFailed();
  }, [filterKey, clearFailed]);

  // Load cached dimensions from IndexedDB
  useEffect(() => {
    const srcs = entries
      .map((entry) => entry.thumbnailUrl)
      .filter((url): url is string => !!url);
    if (srcs.length > 0) {
      loadFromDB(srcs);
    }
  }, [entries, loadFromDB]);

  const items: MasonryItem[] = useMemo(
    () =>
      entries.map((entry) => ({
        entry,
        feed: feedsMap.get(entry.feedId),
      })),
    [entries, feedsMap],
  );

  // Reset before passive scroll effects can inspect a previous view's position.
  useLayoutEffect(() => {
    if (!scrollElement) return;
    scrollSurface.scrollTo(0);
  }, [filterKey, scrollElement, scrollSurface]);

  // Virtuoso creates its own scroller on desktop and uses the document on mobile.
  useEffect(() => {
    const wrapper = scrollContainerRef.current;
    if (!wrapper || !isReady) return;

    const handleScroll = () => {
      if (
        scrollSurface.getDistanceToBottom() < 300 &&
        hasNextPage &&
        !isFetchingNextPage
      ) {
        fetchNextPage();
      }
    };

    if (usesDocumentScroll) {
      const unsubscribe = scrollSurface.subscribe(handleScroll);
      handleScroll();
      return unsubscribe;
    }

    let internalScroller: HTMLElement | null = null;
    let observer: MutationObserver | null = null;

    const setupScrollListener = () => {
      const nextScroller = findScrollableElement(wrapper);
      if (!nextScroller || nextScroller === internalScroller) {
        return Boolean(internalScroller);
      }

      internalScroller?.removeEventListener("scroll", handleScroll);
      internalScroller = nextScroller;
      scrollElementRef.current = nextScroller;
      setInternalScroller(nextScroller);
      nextScroller.addEventListener("scroll", handleScroll, { passive: true });
      return true;
    };

    if (!setupScrollListener()) {
      observer = new MutationObserver(() => {
        if (setupScrollListener() && observer) {
          observer.disconnect();
          observer = null;
        }
      });
      observer.observe(wrapper, { childList: true, subtree: true });
    }

    return () => {
      observer?.disconnect();
      internalScroller?.removeEventListener("scroll", handleScroll);
      scrollElementRef.current = null;
      setInternalScroller((current) =>
        current === internalScroller ? null : current,
      );
    };
  }, [
    fetchNextPage,
    filterKey,
    hasNextPage,
    isFetchingNextPage,
    isReady,
    scrollSurface,
    usesDocumentScroll,
  ]);

  const { endPaddingHeight: scrollReadEndPaddingHeight } =
    useMasonryScrollMarkRead({
      scrollElement,
      scrollSurface,
      entries,
      enabled: markReadOnScroll,
      unreadOnly,
      hasNextPage: Boolean(hasNextPage),
      resetKey: `${filterKey}\u0000${markReadOnScroll}`,
    });
  const title = useMemo(() => {
    switch (selection.type) {
      case "all":
        return t("entry_list.all_pictures");
      case "feed":
        return feedsMap.get(selection.feedId)?.title || t("entry_list.feed");
      case "folder":
        return (
          foldersMap.get(selection.folderId)?.name || t("entry_list.folder")
        );
      case "starred":
        return t("entry_list.starred");
    }
  }, [selection, feedsMap, foldersMap, t]);

  const unreadCount = useMemo(() => {
    if (!unreadCounts) return 0;
    const counts = unreadCounts.counts;
    switch (selection.type) {
      case "all":
        return feeds
          .filter((f) => f.type === contentType)
          .reduce((sum, f) => sum + (counts[f.id] ?? 0), 0);
      case "feed":
        return counts[selection.feedId] ?? 0;
      case "folder":
        return feeds
          .filter(
            (f) => f.folderId === selection.folderId && f.type === contentType,
          )
          .reduce((sum, f) => sum + (counts[f.id] ?? 0), 0);
      case "starred":
        return 0;
    }
  }, [unreadCounts, selection, feeds, contentType]);

  return (
    <div
      ref={wrapperRef}
      className={cn(
        usesDocumentScroll ? "min-h-[var(--app-dvh)]" : "flex h-full flex-col",
      )}
    >
      <MobileDocumentHeader
        enabled={usesDocumentScroll}
        headerRef={headerRef}
        testId="picture-masonry-header"
      >
        <EntryListHeader
          title={title}
          unreadCount={unreadCount}
          unreadOnly={unreadOnly}
          onToggleUnreadOnly={onToggleUnreadOnly}
          onMarkAllRead={onMarkAllRead}
          scrollToTopScope="picture"
          isMobile={isMobile}
          onMenuClick={onMenuClick}
          isTablet={isTablet}
          onToggleSidebar={onToggleSidebar}
          sidebarVisible={sidebarVisible}
        />
      </MobileDocumentHeader>

      <div
        ref={scrollContainerRef}
        className={cn(
          "[overflow-anchor:none]",
          usesDocumentScroll
            ? "min-h-[calc(var(--app-dvh)-3.5rem)]"
            : "min-h-0 flex-1 overflow-hidden",
        )}
      >
        {isLoading ? (
          <div
            className={cn("p-4", !usesDocumentScroll && "h-full overflow-auto")}
          >
            <MasonrySkeleton />
          </div>
        ) : entries.length === 0 ? (
          <div
            className={cn("p-4", !usesDocumentScroll && "h-full overflow-auto")}
          >
            <EmptyState />
          </div>
        ) : isReady ? (
          <VirtuosoMasonry
            key={filterKey}
            data={items}
            columnCount={currentColumn}
            ItemContent={MasonryItemContent}
            useWindowScroll={usesDocumentScroll}
            className={cn("p-4", !usesDocumentScroll && "h-full")}
            style={{ paddingBottom: scrollReadEndPaddingHeight || undefined }}
          />
        ) : null}
        {isFetchingNextPage && <LoadingMore />}
      </div>
    </div>
  );
}

function MasonrySkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="animate-pulse">
          <div className="bg-muted" style={{ height: 150 + (i % 3) * 50 }} />
          <div className="mt-2 flex items-center gap-2">
            <div className="size-4 rounded bg-muted" />
            <div className="h-3 w-20 rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
      {t("entry_list.no_articles")}
    </div>
  );
}

function LoadingMore() {
  return (
    <div className="flex items-center justify-center py-8">
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
