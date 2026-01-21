import { memo, useState, useCallback, useContext, createContext, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { getProxiedImageUrl } from '@/lib/image-proxy'
import { ImagePreviewContext } from './article-content'

// Context for passing article URL to resolve relative URLs and set Referer
// eslint-disable-next-line react-refresh/only-export-components
export const ArticleLinkContext = createContext<string | undefined>(undefined)

// Global cache to track loaded images - prevents flash when component remounts
const loadedImagesCache = new Set<string>()

interface ArticleImageProps {
  src?: string
  alt?: string
  width?: string | number
  height?: string | number
  srcset?: string
  sizes?: string
  className?: string
}

/**
 * Proxy srcset URLs
 */
function proxySrcset(srcset: string, articleUrl?: string): string {
  return srcset
    .split(',')
    .map((entry) => {
      const parts = entry.trim().split(/\s+/)
      if (parts.length >= 1 && parts[0]) {
        parts[0] = getProxiedImageUrl(parts[0], articleUrl)
      }
      return parts.join(' ')
    })
    .join(', ')
}

/**
 * Article image component with lazy loading and error handling
 * Uses memo to prevent re-rendering when parent content changes
 */
export const ArticleImage = memo(function ArticleImage({
  src,
  alt = '',
  width,
  height,
  srcset,
  sizes,
  className,
  ...props
}: ArticleImageProps & React.ImgHTMLAttributes<HTMLImageElement>) {
  const articleUrl = useContext(ArticleLinkContext)
  const imagePreviewContext = useContext(ImagePreviewContext)

  // Compute proxied URLs first so we can check the cache
  const proxiedSrc = useMemo(
    () => (src ? getProxiedImageUrl(src, articleUrl) : ''),
    [src, articleUrl]
  )
  const proxiedSrcset = useMemo(
    () => (srcset ? proxySrcset(srcset, articleUrl) : undefined),
    [srcset, articleUrl]
  )

  // Initialize isLoaded based on cache - prevents flash on remount
  const [isLoaded, setIsLoaded] = useState(() => loadedImagesCache.has(proxiedSrc))
  const [isError, setIsError] = useState(false)

  const handleLoad = useCallback(() => {
    loadedImagesCache.add(proxiedSrc)
    setIsLoaded(true)
  }, [proxiedSrc])

  const handleError = useCallback(() => {
    setIsError(true)
  }, [])

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (src && imagePreviewContext) {
      e.preventDefault()
      e.stopPropagation()
      imagePreviewContext.openPreview(src)
    }
  }, [src, imagePreviewContext])

  if (!src) return null

  if (isError) {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center bg-muted/50 text-muted-foreground rounded',
          className
        )}
        style={{
          width: width ? Number(width) : 'auto',
          height: height ? Number(height) : 80,
        }}
      >
        <svg
          className="size-5 opacity-40"
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
      </span>
    )
  }

  // Only show skeleton placeholder if we have dimensions
  const showSkeleton = !isLoaded && width && height

  return (
    <img
      src={proxiedSrc}
      srcSet={proxiedSrcset}
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
        'max-w-full h-auto rounded transition-opacity duration-200',
        showSkeleton && 'bg-muted/30',
        isLoaded ? 'opacity-100' : 'opacity-70',
        imagePreviewContext && 'cursor-zoom-in',
        className
      )}
      {...props}
    />
  )
})
