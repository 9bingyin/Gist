import type { RefCallback } from 'react'
import { useRef } from 'react'
import { useCodeHighlight } from '@/hooks/useCodeHighlight'
import { useEntryMeta } from '@/hooks/useEntryMeta'
import { ScrollArea } from '@/components/ui/scroll-area'
import { isSafeUrl } from '@/lib/url'
import { ArticleContent } from '@/components/ui/article-content'
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
  const contentRef = useRef<HTMLDivElement>(null)

  // Apply code highlighting after content renders
  useCodeHighlight(contentRef, displayContent ?? '')

  const hasContent = displayContent && displayContent.trim().length > 0

  return (
    <ScrollArea
      ref={scrollRef}
      className="flex-1"
      scrollbarClassName="mt-12"
    >
      <article className="entry-content mx-auto w-full max-w-[720px] px-4 sm:px-6 pb-20 pt-16">
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

        <div ref={contentRef} className="entry-content-body">
          {hasContent ? (
            <ArticleContent content={displayContent} articleUrl={entry.url} />
          ) : (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
              No content available for this article.
            </div>
          )}
        </div>
      </article>
    </ScrollArea>
  )
}
