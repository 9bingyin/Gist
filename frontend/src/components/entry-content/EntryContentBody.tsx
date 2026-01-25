import type { RefCallback } from 'react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useCodeHighlight } from '@/hooks/useCodeHighlight'
import { useEntryMeta } from '@/hooks/useEntryMeta'
import { ScrollArea } from '@/components/ui/scroll-area'
import { isSafeUrl } from '@/lib/url'
import { ArticleContent } from '@/components/ui/article-content'
import type { ArticleContentBlock } from '@/components/ui/article-content'
import { UserIcon, CalendarIcon, ClockIcon } from '@/components/ui/icons'
import { AiSummaryBox } from './AiSummaryBox'
import { BackToTopButton } from './BackToTopButton'
import type { Entry } from '@/types/api'

interface EntryContentBodyProps {
  entry: Entry
  displayTitle?: string | null
  scrollRef: RefCallback<HTMLDivElement>
  scrollNode?: HTMLDivElement | null
  displayContent: string | null | undefined
  displayBlocks?: ArticleContentBlock[] | null
  highlightContent?: string
  aiSummary?: string | null
  isLoadingSummary?: boolean
  summaryError?: string | null
}

export function EntryContentBody({
  entry,
  displayTitle,
  scrollRef,
  scrollNode,
  displayContent,
  displayBlocks,
  highlightContent,
  aiSummary,
  isLoadingSummary,
  summaryError,
}: EntryContentBodyProps) {
  const { t } = useTranslation()
  const { publishedLong, readingTime } = useEntryMeta(entry)
  const title = displayTitle ?? entry.title ?? t('entry.untitled')
  const contentRef = useRef<HTMLDivElement>(null)

  // Apply code highlighting after content renders
  useCodeHighlight(contentRef, highlightContent ?? displayContent ?? '')

  const hasBlocks = !!displayBlocks && displayBlocks.length > 0
  const hasContent = hasBlocks || (!!displayContent && displayContent.trim().length > 0)

  return (
    <ScrollArea
      ref={scrollRef}
      className="flex-1"
      scrollbarClassName="mt-12"
      viewportClassName="entry-content-viewport"
    >
      <article className="entry-content mx-auto w-full max-w-[clamp(45ch,60vw,65ch)] min-w-0 overflow-x-hidden px-4 sm:px-6 pb-20 pt-16">
        <header className="mb-4 space-y-5">
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
                <UserIcon className="size-4 opacity-70" />
                <span>{entry.author}</span>
              </div>
            )}

            {publishedLong && (
              <div className="flex items-center gap-1.5">
                <CalendarIcon className="size-4 opacity-70" />
                <span className="tabular-nums">{publishedLong}</span>
              </div>
            )}

            {readingTime && (
              <div className="flex items-center gap-1.5">
                <ClockIcon className="size-4 opacity-70" />
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

        <div
          ref={contentRef}
          className="prose dark:prose-invert max-w-none hyphens-auto text-[1.0625rem] leading-[1.8] break-words prose-img:!max-w-full prose-img:!h-auto prose-img:shadow-[0_4px_20px_rgba(0,0,0,0.08)] prose-video:!max-w-full prose-video:!h-auto prose-video:shadow-[0_4px_20px_rgba(0,0,0,0.08)] prose-figure:!max-w-full prose-a:underline prose-a:decoration-primary/30 prose-a:underline-offset-[3px] prose-a:break-words prose-blockquote:not-italic prose-blockquote:border-l-2 prose-blockquote:border-muted-foreground/30 prose-blockquote:bg-transparent prose-blockquote:text-foreground/85 prose-blockquote:py-1 prose-blockquote:pl-5 prose-blockquote:ml-0 prose-blockquote:rounded-none prose-th:bg-muted/60 prose-code:bg-muted/60 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:break-all prose-code:before:content-none prose-code:after:content-none prose-pre:p-0 prose-pre:rounded-lg prose-pre:border prose-pre:border-border prose-pre:overflow-hidden"
        >
          {hasContent ? (
            hasBlocks ? (
              <ArticleContent blocks={displayBlocks ?? []} articleUrl={entry.url} />
            ) : (
              <ArticleContent content={displayContent ?? ''} articleUrl={entry.url} />
            )
          ) : (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
              {t('entry.no_content')}
            </div>
          )}
        </div>
      </article>
      {scrollNode && <BackToTopButton scrollNode={scrollNode} />}
    </ScrollArea>
  )
}
