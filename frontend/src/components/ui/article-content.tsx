import { useMemo, createElement } from 'react'
import { parseHtml } from '@/lib/parse-html'
import { ArticleImage, ArticleLinkContext } from './article-image'

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
          // Use src + index as stable key so React can reuse the component
          // Index ensures uniqueness when same image appears multiple times
          const imgProps = props as React.ComponentProps<typeof ArticleImage>
          const key = `${imgProps.src}-${imgIndex++}`
          return createElement(ArticleImage, { ...imgProps, key })
        },
        a: ({ node: _, ...props }) =>
          createElement(ArticleLink, props as React.ComponentProps<'a'>),
      },
    })

    return result.toContent()
  }, [content])

  return (
    <ArticleLinkContext.Provider value={articleUrl}>
      <div className={className}>{renderedContent}</div>
    </ArticleLinkContext.Provider>
  )
}
