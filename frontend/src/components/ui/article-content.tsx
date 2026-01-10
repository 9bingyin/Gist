import { useMemo, createElement } from 'react'
import { parseHtml } from '@/lib/parse-html'
import { ArticleImage, ArticleLinkContext } from './article-image'

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

interface ArticleContentProps {
  content: string
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
    <div className="overflow-x-auto">
      <table {...props}>{children}</table>
    </div>
  )
}

/**
 * Article content renderer using React component tree
 * This allows React to diff only the changed parts, keeping images stable
 */
export function ArticleContent({
  content,
  articleUrl,
  className,
}: ArticleContentProps) {
  const renderedContent = useMemo(() => {
    if (!content) return null

    // Track image index for unique keys (handles duplicate src)
    let imgIndex = 0

    const result = parseHtml(content, {
      components: {
        img: ({ node: _, ...props }) => {
          const imgProps = props as React.ComponentProps<typeof ArticleImage>
          const src = imgProps.src || ''
          // Use articleUrl + src + index as cache key for uniqueness
          // Index handles cases where same image appears multiple times
          const cacheKey = `${articleUrl || ''}-${src}-${imgIndex++}`

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
        a: ({ node: _, ...props }) =>
          createElement(ArticleLink, props as React.ComponentProps<'a'>),
        table: ({ node: _, ...props }) =>
          createElement(ArticleTable, props as React.ComponentProps<'table'>),
      },
    })

    return result.toContent()
  }, [content, articleUrl])

  return (
    <ArticleLinkContext.Provider value={articleUrl}>
      <div className={className}>{renderedContent}</div>
    </ArticleLinkContext.Provider>
  )
}
