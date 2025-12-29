import type { RefCallback } from 'react'
import { useMemo, useRef } from 'react'
import DOMPurify from 'dompurify'
import { useCodeHighlight } from '@/hooks/useCodeHighlight'
import { useEntryMeta } from '@/hooks/useEntryMeta'
import { isSafeUrl } from '@/lib/url'
import type { Entry } from '@/types/api'

interface EntryContentBodyProps {
  entry: Entry
  scrollRef: RefCallback<HTMLDivElement>
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

function ensurePurifyHooks() {
  if (hooksBound) return

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

export function EntryContentBody({
  entry,
  scrollRef,
}: EntryContentBodyProps) {
  const { publishedLong, readingTime } = useEntryMeta(entry)
  const contentRef = useRef<HTMLDivElement>(null)
  const sanitizedContent = useMemo(() => {
    if (!entry.content) return ''
    ensurePurifyHooks()

    return DOMPurify.sanitize(entry.content, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      ADD_ATTR: ['target', 'rel', 'loading', 'decoding'],
      ALLOW_DATA_ATTR: false,
    })
  }, [entry.content])

  useCodeHighlight(contentRef, sanitizedContent)

  const hasContent = sanitizedContent.trim().length > 0

  return (
    <div ref={scrollRef} className="flex-1 overflow-auto">
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
                {entry.title || 'Untitled'}
              </a>
            ) : (
              entry.title || 'Untitled'
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

        {hasContent ? (
          <div
            ref={contentRef}
            className="entry-content-body"
            dangerouslySetInnerHTML={{ __html: sanitizedContent }}
          />
        ) : (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
            No content available for this article.
          </div>
        )}
      </article>
    </div>
  )
}
