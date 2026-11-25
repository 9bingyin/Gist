import { useEffect, useCallback, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";
import { ExternalLink, Play, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { isVideoThumbnail } from "@/lib/media-utils";
import { formatRelativeTime } from "@/lib/date-utils";
import { stripHtml } from "@/lib/html-utils";
import {
  useMarkAsRead,
  useMarkAsStarred,
  useRemoveFromUnreadList,
} from "@/hooks/useEntries";
import { useLightboxStore } from "@/stores/lightbox-store";
import { FeedIcon } from "@/components/ui/feed-icon";
import { MediaCarouselOverlay } from "@/components/ui/media-carousel-overlay";
import type { Entry } from "@/types/api";

export function Lightbox() {
  const { t } = useTranslation();
  const {
    isOpen,
    entryId,
    storeEntry,
    feed,
    images,
    currentIndex,
    initialIndex,
    close,
    reset,
    setIndex,
  } = useLightboxStore(
    useShallow((s) => ({
      isOpen: s.isOpen,
      entryId: s.entryId,
      storeEntry: s.entry,
      feed: s.feed,
      images: s.images,
      currentIndex: s.currentIndex,
      initialIndex: s.initialIndex,
      close: s.close,
      reset: s.reset,
      setIndex: s.setIndex,
    })),
  );

  // Subscribe to React Query cache for real-time updates (e.g. starred status)
  const { data: cachedEntry } = useQuery<Entry | undefined>({
    queryKey: ["entry", entryId],
    queryFn: () => Promise.resolve(storeEntry ?? undefined),
    enabled: false,
  });
  const entry = cachedEntry ?? storeEntry;

  const { mutate: markAsRead } = useMarkAsRead();
  const { mutate: markAsStarred } = useMarkAsStarred();
  const removeFromUnreadList = useRemoveFromUnreadList();

  const markedAsReadRef = useRef<Set<string>>(new Set());
  const [failedIconPath, setFailedIconPath] = useState<string | null>(null);
  const showIcon = Boolean(feed?.iconPath && failedIconPath !== feed.iconPath);

  // Mark entry as read when lightbox opens
  useEffect(() => {
    if (
      isOpen &&
      entry &&
      !entry.read &&
      !markedAsReadRef.current.has(entry.id)
    ) {
      markedAsReadRef.current.add(entry.id);
      markAsRead({ id: entry.id, read: true, skipInvalidate: true });
    }
  }, [isOpen, entry, markAsRead]);

  // Deferred removal from unreadOnly list on close
  useEffect(() => {
    if (!isOpen && markedAsReadRef.current.size > 0) {
      removeFromUnreadList(markedAsReadRef.current);
      markedAsReadRef.current.clear();
    }
  }, [isOpen, removeFromUnreadList]);

  const handleToggleStarred = useCallback(() => {
    if (entry) {
      markAsStarred({ id: entry.id, starred: !entry.starred });
    }
  }, [entry, markAsStarred]);

  const publishedAt = entry?.publishedAt
    ? formatRelativeTime(entry.publishedAt, t)
    : null;

  const contentPreview = entry?.content
    ? stripHtml(entry.content).slice(0, 200)
    : null;

  const starLabel = entry?.starred
    ? t("entry.remove_from_starred")
    : t("entry.add_to_starred");

  return (
    <MediaCarouselOverlay
      isOpen={isOpen}
      images={images}
      currentIndex={currentIndex}
      initialIndex={initialIndex}
      onClose={close}
      onReset={reset}
      onIndexChange={setIndex}
      carouselContainerClassName="safe-area-x"
      slideClassName="px-0 sm:px-2 lg:px-4"
      topEndExtra={
        <>
          <button
            type="button"
            className={cn(
              "flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20",
              entry?.starred &&
                "bg-amber-500/20 text-amber-500 hover:bg-amber-500/30",
            )}
            onClick={(e) => {
              e.stopPropagation();
              handleToggleStarred();
            }}
            title={starLabel}
            aria-label={starLabel}
          >
            <Star
              className="size-5"
              fill={entry?.starred ? "currentColor" : "none"}
            />
          </button>
          {entry?.url && (
            <a
              href={entry.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("entry.open_original")}
              className="flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="size-5" />
            </a>
          )}
        </>
      }
      singleImageOverlay={
        isVideoThumbnail(entry?.thumbnailUrl) && entry?.url ? (
          <a
            href={entry.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("entry.open_original")}
            className="absolute flex items-center justify-center transition-transform hover:scale-110"
            onClick={(e) => e.stopPropagation()}
          >
            <Play className="size-20 fill-white text-white drop-shadow-lg" />
          </a>
        ) : null
      }
      bottomBar={
        <div
          className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/80 via-black/50 to-black/0 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] backdrop-blur-sm sm:bg-black/50 sm:px-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mx-auto max-w-3xl">
            <div className="mb-2 flex items-center gap-2 text-sm text-white/60">
              {showIcon && feed?.iconPath ? (
                <img
                  src={`/icons/${feed.iconPath}`}
                  alt=""
                  className="size-4 shrink-0 rounded object-contain"
                  onError={() => setFailedIconPath(feed.iconPath ?? null)}
                />
              ) : (
                <FeedIcon className="size-4 shrink-0" />
              )}
              <span>{feed?.title || t("entry.unknown_feed")}</span>
              {publishedAt && (
                <>
                  <span>·</span>
                  <span>{publishedAt}</span>
                </>
              )}
              {images.length > 1 && (
                <>
                  <span>·</span>
                  <span>
                    {currentIndex + 1} / {images.length}
                  </span>
                </>
              )}
            </div>

            {entry?.title && (
              <h2 className="mb-1 text-lg font-semibold text-white">
                {entry.title}
              </h2>
            )}

            {contentPreview && (
              <p className="line-clamp-2 text-sm text-white/70">
                {contentPreview}
              </p>
            )}
          </div>
        </div>
      }
    />
  );
}
