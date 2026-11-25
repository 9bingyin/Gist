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
import { Loader2 } from "lucide-react";
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
import { createFeedsMap, createFoldersMap } from "@/lib/content-types";
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
  const [scrollContainerNode, setScrollContainerNode] =
    useState<HTMLDivElement | null>(null);
  const scrollElementRef = useRef<HTMLElement>(null);
  const [internalScroller, setInternalScroller] = useState<HTMLElement | null>(
    null,
  );

  const setScrollContainerRef = useCallback((node: HTMLDivElement | null) => {
    scrollContainerRef.current = node;
    setScrollContainerNode(node);
  }, []);

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

  const feedsMap = useMemo(() => createFeedsMap(feeds), [feeds]);
  const foldersMap = useMemo(() => createFoldersMap(folders), [folders]);

  const entries = useMemo(() => flattenUniqueEntries(data?.pages), [data]);

  const filterKey = useMemo(
    () => `${getSelectionKey(selection)}-${unreadOnly}`,
    [selection, unreadOnly],
  );

  useEffect(() => {
    clearFailed();
  }, [filterKey, clearFailed]);

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

  const hasEntries = entries.length > 0;
  const activeInternalScroller =
    !usesDocumentScroll && isReady && !isLoading && hasEntries
      ? internalScroller
      : null;

  // Effect 1: Locate Virtuoso's internal scroll container on desktop (never re-runs on pagination)
  useEffect(() => {
    if (usesDocumentScroll || !isReady || isLoading || !hasEntries) {
      scrollElementRef.current = null;
      return;
    }

    const wrapper = scrollContainerRef.current;
    if (!wrapper) return;

    let found: HTMLElement | null = null;
    let observer: MutationObserver | null = null;

    const locate = () => {
      const next = findScrollableElement(wrapper);
      if (!next) return false;
      found = next;
      scrollElementRef.current = next;
      setInternalScroller(next);
      return true;
    };

    if (!locate()) {
      observer = new MutationObserver(() => {
        if (locate() && observer) {
          observer.disconnect();
          observer = null;
        }
      });
      observer.observe(wrapper, { childList: true, subtree: true });
    }

    return () => {
      observer?.disconnect();
      if (scrollElementRef.current === found) {
        scrollElementRef.current = null;
      }
      setInternalScroller((current) => (current === found ? null : current));
    };
  }, [filterKey, isReady, isLoading, hasEntries, usesDocumentScroll]);

  // Effect 2: Attach pagination scroll listener (cheap, never re-queries DOM)
  useEffect(() => {
    if (!isReady) return;
    if (!usesDocumentScroll && !activeInternalScroller) return;

    const handleScroll = () => {
      if (
        scrollSurface.getDistanceToBottom() < 300 &&
        hasNextPage &&
        !isFetchingNextPage
      ) {
        fetchNextPage();
      }
    };

    const unsubscribe = scrollSurface.subscribe(handleScroll);
    if (usesDocumentScroll) {
      handleScroll();
    }
    return unsubscribe;
  }, [
    activeInternalScroller,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isReady,
    scrollSurface,
    usesDocumentScroll,
  ]);

  const observeRoot = usesDocumentScroll
    ? scrollContainerNode
    : activeInternalScroller;

  const { endPaddingHeight: scrollReadEndPaddingHeight } =
    useMasonryScrollMarkRead({
      observeRoot,
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
        ref={setScrollContainerRef}
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
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}
