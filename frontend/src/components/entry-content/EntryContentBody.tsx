import type { RefCallback } from 'react'
import { memo, useMemo, useRef } from 'react'
import DOMPurify from 'dompurify'
import { useCodeHighlight } from '@/hooks/useCodeHighlight'
import { useEntryMeta } from '@/hooks/useEntryMeta'
import { ScrollArea } from '@/components/ui/scroll-area'
import { isSafeUrl } from '@/lib/url'
import { getProxiedImageUrl } from '@/lib/image-proxy'
import { AiSummaryBox } from './AiSummaryBox'
import type { Entry } from '@/types/api'

interface EntryContentBodyProps {
  entry: Entry
  displayTitle?: string | null
  scrollRef: RefCallback<HTMLDivElement>
  displayContent: string | null | undefined
  aiSummary?: string | null
  isLoadingSummary?: boolean
  summaryError?: string | null
}

interface SanitizedContentProps {
  content: string | null | undefined
  articleUrl?: string
}

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'b',
  'i',
  'u',
  's',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'a',
  'img',
  'figure',
  'figcaption',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'div',
  'span',
  'hr',
  'sup',
  'sub',
  'kbd',
  'mark',
  'del',
  'ins',
  'small',
  'caption',
  'colgroup',
  'col',
  'time',
  'abbr',
  'cite',
  'q',
  'details',
  'summary',
  'video',
  'audio',
  'source',
]

const ALLOWED_ATTR = [
  'href',
  'src',
  'alt',
  'title',
  'class',
  'target',
  'rel',
  'width',
  'height',
  'loading',
  'decoding',
  'srcset',
  'sizes',
  'id',
  'lang',
  'dir',
  'cite',
  'datetime',
  'abbr',
  'controls',
  'open',
  'poster',
  'preload',
  'type',
  'muted',
  'loop',
  'autoplay',
  'playsinline',
  'colspan',
  'rowspan',
]

let hooksBound = false

function ensureBasePurifyHooks() {
  if (hooksBound) return

  // Only set up hooks that don't require articleUrl context
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node instanceof HTMLAnchorElement) {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    }

    if (node instanceof HTMLImageElement) {
      node.setAttribute('loading', 'lazy')
      node.setAttribute('decoding', 'async')
    }
  })

  hooksBound = true
}

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

function proxyImageUrls(fragment: DocumentFragment, articleUrl?: string): void {
  // Proxy img src and srcset
  fragment.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src')
    if (src) {
      img.setAttribute('src', getProxiedImageUrl(src, articleUrl))
    }
    const srcset = img.getAttribute('srcset')
    if (srcset) {
      img.setAttribute('srcset', proxySrcset(srcset, articleUrl))
    }
  })

  // Proxy source elements only inside <picture> (responsive images)
  // Do NOT proxy source inside <video> or <audio> to avoid high bandwidth usage
  fragment.querySelectorAll('picture > source').forEach((source) => {
    const srcset = source.getAttribute('srcset')
    if (srcset) {
      source.setAttribute('srcset', proxySrcset(srcset, articleUrl))
    }
  })

  // Proxy video poster (cover image only, not the video itself)
  fragment.querySelectorAll('video').forEach((video) => {
    const poster = video.getAttribute('poster')
    if (poster) {
      video.setAttribute('poster', getProxiedImageUrl(poster, articleUrl))
    }
  })
}

function sanitizeContent(content: string, articleUrl?: string): string {
  ensureBasePurifyHooks()

  // Get DOM fragment instead of string for post-processing
  const fragment = DOMPurify.sanitize(content, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ADD_ATTR: ['target', 'rel', 'loading', 'decoding'],
    ALLOW_DATA_ATTR: false,
    RETURN_DOM_FRAGMENT: true,
  })

  // Proxy image URLs with articleUrl passed directly (no global state)
  proxyImageUrls(fragment, articleUrl)

  // Serialize back to string
  const div = document.createElement('div')
  div.appendChild(fragment)
  return div.innerHTML
}

// Memoized component to prevent re-rendering when parent state changes
const SanitizedContent = memo(function SanitizedContent({
  content,
  articleUrl,
}: SanitizedContentProps) {
  const contentRef = useRef<HTMLDivElement>(null)

  const sanitizedHtml = useMemo(() => {
    if (!content) return ''
    return sanitizeContent(content, articleUrl)
  }, [content, articleUrl])

  useCodeHighlight(contentRef, sanitizedHtml)

  const hasContent = sanitizedHtml.trim().length > 0

  if (!hasContent) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
        No content available for this article.
      </div>
    )
  }

  return (
    <div
      ref={contentRef}
      className="entry-content-body"
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  )
})

export function EntryContentBody({
  entry,
  displayTitle,
  scrollRef,
  displayContent,
  aiSummary,
  isLoadingSummary,
  summaryError,
}: EntryContentBodyProps) {
  const { publishedLong, readingTime } = useEntryMeta(entry)
  const title = displayTitle ?? entry.title ?? 'Untitled'

  return (
    <ScrollArea
      ref={scrollRef}
      className="flex-1"
      scrollbarClassName="mt-12"
    >
      <article className="entry-content mx-auto w-full max-w-[720px] px-6 pb-20 pt-16">
        <header className="mb-10 space-y-5">
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl sm:leading-[1.15]">
            {entry.url && isSafeUrl(entry.url) ? (
              <a
                href={entry.url}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-opacity hover:opacity-80"
              >
                {title}
              </a>
            ) : (
              title
            )}
          </h1>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-muted-foreground">
            {entry.author && (
              <div className="flex items-center gap-1.5">
                <svg
                  className="size-4 opacity-70"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
                <span>{entry.author}</span>
              </div>
            )}

            {publishedLong && (
              <div className="flex items-center gap-1.5">
                <svg
                  className="size-4 opacity-70"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <span className="tabular-nums">{publishedLong}</span>
              </div>
            )}

            {readingTime && (
              <div className="flex items-center gap-1.5">
                <svg
                  className="size-4 opacity-70"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>{readingTime}</span>
              </div>
            )}
          </div>
          <hr className="border-border/60" />
        </header>

        <AiSummaryBox
          content={aiSummary ?? null}
          isLoading={isLoadingSummary}
          error={summaryError}
        />

        <SanitizedContent content={displayContent} articleUrl={entry.url} />
      </article>
    </ScrollArea>
  )
}
