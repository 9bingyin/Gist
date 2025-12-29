import { useMemo } from 'react'
import DOMPurify from 'dompurify'
import type { Entry } from '@/types/api'

interface EntryContentBodyProps {
  entry: Entry
}

export function EntryContentBody({ entry }: EntryContentBodyProps) {
  const sanitizedContent = useMemo(() => {
    if (!entry.content) return ''

    return DOMPurify.sanitize(entry.content, {
      ALLOWED_TAGS: [
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
      ],
      ALLOWED_ATTR: [
        'href',
        'src',
        'alt',
        'title',
        'class',
        'target',
        'rel',
        'width',
        'height',
      ],
      ADD_ATTR: ['target'],
      ALLOW_DATA_ATTR: false,
    })
  }, [entry.content])

  return (
    <div className="flex-1 overflow-auto px-6 py-8">
      <article className="mx-auto max-w-2xl">
        {entry.url && (
          <a
            href={entry.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-4 inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            Read original article
            <svg
              className="size-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </a>
        )}

        {sanitizedContent ? (
          <div
            className="prose prose-neutral dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: sanitizedContent }}
          />
        ) : (
          <p className="text-muted-foreground">No content available.</p>
        )}
      </article>
    </div>
  )
}
