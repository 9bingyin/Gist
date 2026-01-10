import { memo, useMemo, createElement } from 'react'
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
    <div className="overflow-x-auto">
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
        a: ({ node: _, ...props }) =>
          createElement(ArticleLink, props as React.ComponentProps<'a'>),
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

  return (
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
  )
}
