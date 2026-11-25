import { memo, useState, useCallback, useContext, useMemo } from "react";
import { Image as LucideImage } from "lucide-react";
import { cn } from "@/lib/utils";
import { getProxiedImageUrl } from "@/lib/image-proxy";
import { ArticleLinkContext, ImagePreviewContext } from "./article-context";

// Global cache to track loaded images - prevents flash when component remounts
const loadedImagesCache = new Set<string>();

interface ArticleImageProps {
  src?: string;
  alt?: string;
  width?: string | number;
  height?: string | number;
  srcSet?: string;
  sizes?: string;
  className?: string;
}

/**
 * Proxy srcset URLs
 */
function proxySrcset(srcSet: string, articleUrl?: string): string {
  return srcSet
    .split(",")
    .map((entry) => {
      const parts = entry.trim().split(/\s+/);
      if (parts.length >= 1 && parts[0]) {
        parts[0] = getProxiedImageUrl(parts[0], articleUrl);
      }
      return parts.join(" ");
    })
    .join(", ");
}

/**
 * Article image component with lazy loading and error handling.
 * Uses memo to prevent re-rendering when parent content changes.
 */
export const ArticleImage = memo(function ArticleImage({
  src,
  alt = "",
  width,
  height,
  srcSet,
  sizes,
  className,
  ...props
}: ArticleImageProps & React.ImgHTMLAttributes<HTMLImageElement>) {
  const articleUrl = useContext(ArticleLinkContext);
  const imagePreviewContext = useContext(ImagePreviewContext);

  const proxiedSrc = useMemo(
    () => (src ? getProxiedImageUrl(src, articleUrl) : ""),
    [src, articleUrl],
  );
  const proxiedSrcSet = useMemo(
    () => (srcSet ? proxySrcset(srcSet, articleUrl) : undefined),
    [srcSet, articleUrl],
  );

  const [loadedSrc, setLoadedSrc] = useState<string | null>(() =>
    loadedImagesCache.has(proxiedSrc) ? proxiedSrc : null,
  );
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const isLoaded =
    loadedSrc === proxiedSrc || loadedImagesCache.has(proxiedSrc);
  const isError = failedSrc === proxiedSrc;

  const handleLoad = useCallback(() => {
    loadedImagesCache.add(proxiedSrc);
    setLoadedSrc(proxiedSrc);
  }, [proxiedSrc]);

  const handleError = useCallback(() => {
    setFailedSrc(proxiedSrc);
  }, [proxiedSrc]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (src && imagePreviewContext) {
        e.preventDefault();
        e.stopPropagation();
        imagePreviewContext.openPreview(src);
      }
    },
    [src, imagePreviewContext],
  );

  if (!src) return null;

  if (isError) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center bg-muted/50 text-muted-foreground rounded",
          className,
        )}
        style={{
          width: width ? Number(width) : "auto",
          height: height ? Number(height) : 80,
        }}
      >
        <LucideImage className="size-5 opacity-40" strokeWidth={1.5} />
      </span>
    );
  }

  const showSkeleton = !isLoaded && width && height;

  return (
    <img
      src={proxiedSrc}
      srcSet={proxiedSrcSet}
      sizes={sizes}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      onLoad={handleLoad}
      onError={handleError}
      onClick={handleClick}
      className={cn(
        "max-w-full h-auto rounded transition-opacity duration-200",
        showSkeleton && "bg-muted/30",
        isLoaded ? "opacity-100" : "opacity-70",
        imagePreviewContext && "cursor-zoom-in",
        className,
      )}
      {...props}
    />
  );
});
