"use client";

import { memo, useState, useCallback, useContext, createContext } from "react";
import { cn } from "@/lib/utils";

// Context for passing article link to resolve relative URLs
export const ArticleLinkContext = createContext<string | undefined>(undefined);

interface ArticleImageProps {
  src?: string;
  alt?: string;
  width?: string | number;
  height?: string | number;
  className?: string;
}

/**
 * Convert relative URL to absolute URL based on the article link
 */
function toAbsoluteUrl(url: string, baseUrl: string | undefined): string | null {
  if (!url) return null;

  // Already absolute URL
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  // Protocol-relative URL
  if (url.startsWith("//")) {
    return `https:${url}`;
  }

  // Data URI or already proxied - return as is
  if (url.startsWith("data:") || url.startsWith("/api/")) {
    return url;
  }

  // Relative URL - need base URL
  if (!baseUrl) return null;

  try {
    const base = new URL(baseUrl);

    // Absolute path (starts with /)
    if (url.startsWith("/")) {
      return `${base.origin}${url}`;
    }

    // Relative path
    const basePath = base.pathname.substring(0, base.pathname.lastIndexOf("/") + 1);
    return `${base.origin}${basePath}${url}`;
  } catch {
    return null;
  }
}

/**
 * Get proxied image URL
 */
function getProxiedUrl(src: string, articleLink: string | undefined): string {
  const absoluteUrl = toAbsoluteUrl(src, articleLink);
  if (!absoluteUrl) return src;

  // Skip data URIs and already proxied URLs
  if (absoluteUrl.startsWith("data:") || absoluteUrl.startsWith("/api/")) {
    return absoluteUrl;
  }

  return `/api/proxy/image?url=${encodeURIComponent(absoluteUrl)}`;
}

/**
 * Article image component with lazy loading and error handling
 */
export const ArticleImage = memo(function ArticleImage({
  src,
  alt = "",
  width,
  height,
  className,
  ...props
}: ArticleImageProps & React.ImgHTMLAttributes<HTMLImageElement>) {
  const articleLink = useContext(ArticleLinkContext);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isError, setIsError] = useState(false);

  const handleLoad = useCallback(() => {
    setIsLoaded(true);
  }, []);

  const handleError = useCallback(() => {
    setIsError(true);
  }, []);

  if (!src) return null;

  const proxiedSrc = getProxiedUrl(src, articleLink);

  if (isError) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted text-muted-foreground rounded-lg my-6",
          className
        )}
        style={{ minHeight: height ? Number(height) : 200 }}
      >
        <svg
          className="h-8 w-8 opacity-30"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </div>
    );
  }

  return (
    <span className="relative block my-6">
      {!isLoaded && (
        <span
          className="absolute inset-0 bg-muted animate-pulse rounded-lg"
          style={{ minHeight: height ? Number(height) : 200 }}
        />
      )}
      <img
        src={proxiedSrc}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        onLoad={handleLoad}
        onError={handleError}
        className={cn(
          "max-w-full h-auto rounded-lg transition-opacity duration-200",
          isLoaded ? "opacity-100" : "opacity-0",
          className
        )}
        {...props}
      />
    </span>
  );
});
