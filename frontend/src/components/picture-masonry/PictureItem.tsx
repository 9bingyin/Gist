import { memo, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { getEntryImages } from "@/lib/extract-images";
import { getProxiedImageUrl } from "@/lib/image-proxy";
import { isVideoThumbnail } from "@/lib/media-utils";
import { formatRelativeTime } from "@/lib/date-utils";
import { useLightboxStore } from "@/stores/lightbox-store";
import {
  useImageDimension,
  useImageDimensionsStore,
  useImageFailed,
} from "@/stores/image-dimensions-store";
import { FeedIcon } from "@/components/ui/feed-icon";
import type { Entry, Feed } from "@/types/api";

interface PictureItemProps {
  entry: Entry;
  feed?: Feed;
}

const DEFAULT_RATIO = 3 / 4;

export const PictureItem = memo(function PictureItem({
  entry,
  feed,
}: PictureItemProps) {
  const { t } = useTranslation();
  const openLightbox = useLightboxStore((state) => state.open);
  const setDimension = useImageDimensionsStore((state) => state.setDimension);
  const markFailed = useImageDimensionsStore((state) => state.markFailed);

  const thumbnailUrl = entry.thumbnailUrl;
  const cachedDimension = useImageDimension(thumbnailUrl);
  const isFailed = useImageFailed(thumbnailUrl);
  const aspectRatio = cachedDimension?.ratio ?? DEFAULT_RATIO;
  const isVideo = isVideoThumbnail(thumbnailUrl);

  const [imageLoaded, setImageLoaded] = useState(false);
  const [failedIconPath, setFailedIconPath] = useState<string | null>(null);

  const showIcon = Boolean(feed?.iconPath && failedIconPath !== feed.iconPath);

  const handleImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      if (img.naturalWidth && img.naturalHeight && thumbnailUrl) {
        setDimension(thumbnailUrl, img.naturalWidth, img.naturalHeight);
      }
      setImageLoaded(true);
    },
    [thumbnailUrl, setDimension],
  );

  const handleClick = useCallback(() => {
    const images = getEntryImages(
      entry.thumbnailUrl,
      entry.content,
      entry.url ?? undefined,
    );
    if (images.length > 0) {
      openLightbox(entry, feed, images, 0);
    }
  }, [entry, feed, openLightbox]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleClick();
      }
    },
    [handleClick],
  );

  const publishedAt = entry.publishedAt
    ? formatRelativeTime(entry.publishedAt, t)
    : null;

  if (!thumbnailUrl || isFailed) {
    return null;
  }

  return (
    <div className="p-1 sm:p-1.5">
      <div
        role="button"
        tabIndex={0}
        aria-label={entry.title || feed?.title || t("entry.untitled")}
        className="cursor-pointer overflow-hidden bg-card shadow-sm transition-shadow hover:shadow-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        {/* Image container with aspect ratio */}
        <div
          className="relative overflow-hidden bg-muted"
          style={{ aspectRatio }}
        >
          <img
            src={getProxiedImageUrl(thumbnailUrl, entry.url ?? undefined)}
            alt={entry.title || ""}
            className={cn(
              "size-full object-cover transition-opacity duration-300",
              imageLoaded ? "opacity-100" : "opacity-0",
            )}
            loading="lazy"
            onLoad={handleImageLoad}
            onError={() => thumbnailUrl && markFailed(thumbnailUrl)}
          />
          {!imageLoaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground/60" />
            </div>
          )}
          {isVideo && imageLoaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Play className="size-12 fill-white text-white drop-shadow-lg" />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex h-10 items-center px-2 text-xs text-muted-foreground">
          <div
            className={cn(
              "mr-1.5 size-1.5 shrink-0 rounded-full bg-orange-500 transition-all duration-200",
              entry.read && "mr-0 w-0",
            )}
          />
          {showIcon && feed?.iconPath ? (
            <img
              src={`/icons/${feed.iconPath}`}
              alt=""
              className="mr-1.5 size-4 shrink-0 rounded object-contain"
              onError={() => setFailedIconPath(feed.iconPath ?? null)}
            />
          ) : (
            <FeedIcon className="mr-1.5 size-4 shrink-0 text-muted-foreground/50" />
          )}
          <span className="truncate">
            {feed?.title || t("entry.unknown_feed")}
          </span>
          {publishedAt && (
            <>
              <span className="mx-1.5 text-muted-foreground/50">·</span>
              <span className="shrink-0">{publishedAt}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
});
