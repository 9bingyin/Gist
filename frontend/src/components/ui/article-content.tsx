import { memo, useMemo, createElement, createContext, useCallback } from 'react'
import { parseHtml } from '@/lib/parse-html'
import { getProxiedImageUrl } from '@/lib/image-proxy'
import { useImagePreviewStore } from '@/stores/image-preview-store'
import { ArticleImage, ArticleLinkContext } from './article-image'

// Context for image preview - provides images list and open function
export interface ImagePreviewContextValue {
  images: string[]
  openPreview: (src: string) => void
}

// eslint-disable-next-line react-refresh/only-export-components
export const ImagePreviewContext = createContext<ImagePreviewContextValue | null>(null)

// Extract image URLs from HTML content
function extractImagesFromHtml(html: string, articleUrl?: string): string[] {
  const images: string[] = []
  // Match img tags and extract src attribute
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi
  let match
  while ((match = imgRegex.exec(html)) !== null) {
    const src = match[1]
    if (src) {
      const proxiedSrc = getProxiedImageUrl(src, articleUrl)
      if (!images.includes(proxiedSrc)) {
        images.push(proxiedSrc)
      }
    }
  }
  return images
}

// Global cache for image elements to prevent re-creation during content updates
// Key: articleUrl + imageSrc, Value: React element
const imageElementCache = new Map<string, React.ReactElement>()
const IMAGE_CACHE_MAX_SIZE = 200

// Simple LRU-like cleanup: remove oldest entries when cache exceeds max size
function pruneImageCache() {
  if (imageElementCache.size > IMAGE_CACHE_MAX_SIZE) {
    const keysToDelete = Array.from(imageElementCache.keys()).slice(
      0,
      imageElementCache.size - IMAGE_CACHE_MAX_SIZE
    )
    keysToDelete.forEach((key) => imageElementCache.delete(key))
  }
}

export interface ArticleContentBlock {
  key: string
  html: string
}

type ArticleContentProps =
  | {
      content: string
      blocks?: never
      articleUrl?: string
      className?: string
    }
  | {
      content?: never
      blocks: ArticleContentBlock[]
      articleUrl?: string
      className?: string
    }

/**
 * Custom link component that opens in new tab
 */
function ArticleLink({
  href,
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  )
}

/**
 * Wrapper for table elements to enable horizontal scrolling on mobile
 */
function ArticleTable({
  children,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="article-table-wrapper overflow-x-auto max-w-full -webkit-overflow-scrolling-touch">
      <table {...props}>{children}</table>
    </div>
  )
}

const ArticleContentBlockRenderer = memo(function ArticleContentBlockRenderer({
  content,
  articleUrl,
}: {
  content: string
  articleUrl?: string
}) {
  const renderedContent = useMemo(() => {
    if (!content) return null

    const result = parseHtml(content, {
      components: {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        img: ({ node: _, ...props }) => {
          const imgProps = props as React.ComponentProps<typeof ArticleImage>
          const src = imgProps.src || ''
          // Use articleUrl + src as cache key
          // This ensures the same image is cached regardless of rendering mode
          // (string mode vs blocks mode), preventing flicker during translation
          const cacheKey = `${articleUrl || ''}-${src}`

          // Reuse cached element to prevent re-creation during translation updates
          if (imageElementCache.has(cacheKey)) {
            return imageElementCache.get(cacheKey)!
          }

          // Create new element and cache it
          const element = createElement(ArticleImage, { ...imgProps, key: cacheKey })
          imageElementCache.set(cacheKey, element)
          pruneImageCache()
          return element
        },
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        a: ({ node: _, ...props }) =>
          createElement(ArticleLink, props as React.ComponentProps<'a'>),
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        table: ({ node: _, ...props }) =>
          createElement(ArticleTable, props as React.ComponentProps<'table'>),
      },
    })

    return result.toContent()
  }, [content, articleUrl])

  return <>{renderedContent}</>
})

/**
 * Article content renderer using React component tree
 * This allows React to diff only the changed parts, keeping images stable
 */
export function ArticleContent(props: ArticleContentProps) {
  const { articleUrl, className } = props
  const openImagePreview = useImagePreviewStore((s) => s.open)

  // Extract all images from content upfront
  const images = useMemo(() => {
    if ('blocks' in props && props.blocks) {
      const allImages: string[] = []
      for (const block of props.blocks) {
        const blockImages = extractImagesFromHtml(block.html, articleUrl)
        for (const img of blockImages) {
          if (!allImages.includes(img)) {
            allImages.push(img)
          }
        }
      }
      return allImages
    } else if ('content' in props && props.content) {
      return extractImagesFromHtml(props.content, articleUrl)
    }
    return []
  }, [props, articleUrl])

  const openPreview = useCallback((src: string) => {
    const proxiedSrc = getProxiedImageUrl(src, articleUrl)
    const index = images.indexOf(proxiedSrc)
    if (index !== -1) {
      openImagePreview(images, index)
    } else {
      // Fallback: just open the single image
      openImagePreview([proxiedSrc], 0)
    }
  }, [articleUrl, images, openImagePreview])

  const contextValue = useMemo(() => ({
    images,
    openPreview,
  }), [images, openPreview])

  return (
    <ImagePreviewContext.Provider value={contextValue}>
      <ArticleLinkContext.Provider value={articleUrl}>
        <div className={className}>
          {'blocks' in props && props.blocks ? (
            props.blocks.map((block) => (
              <ArticleContentBlockRenderer
                key={block.key}
                content={block.html}
                articleUrl={articleUrl}
              />
            ))
          ) : 'content' in props ? (
            <ArticleContentBlockRenderer
              content={props.content}
              articleUrl={articleUrl}
            />
          ) : null}
        </div>
      </ArticleLinkContext.Provider>
    </ImagePreviewContext.Provider>
  )
}
