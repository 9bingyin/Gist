import { useTranslation } from 'react-i18next'
import { isSafeUrl } from '@/lib/url'
import { cn } from '@/lib/utils'
import type { Entry } from '@/types/api'

interface EntryContentHeaderProps {
  entry: Entry
  displayTitle?: string | null
  isAtTop: boolean
  isReadableActive: boolean
  isLoading: boolean
  error: string | null
  onToggleReadable: () => void
  onToggleStarred: () => void
  isLoadingSummary?: boolean
  hasSummary?: boolean
  onToggleSummary?: () => void
  isTranslating?: boolean
  hasTranslation?: boolean
  onToggleTranslation?: () => void
}

export function EntryContentHeader({
  entry,
  displayTitle,
  isAtTop,
  isReadableActive,
  isLoading,
  error,
  onToggleReadable,
  onToggleStarred,
  isLoadingSummary,
  hasSummary,
  onToggleSummary,
  isTranslating,
  hasTranslation,
  onToggleTranslation,
}: EntryContentHeaderProps) {
  const { t } = useTranslation()
  const safeUrl = entry.url && isSafeUrl(entry.url) ? entry.url : null
  const title = displayTitle ?? entry.title ?? t('entry.untitled')

  return (
    <div className="absolute inset-x-0 top-0 z-20">
      {/* Background and Border Layer */}
      <div
        className={cn(
          'absolute inset-0 transition-opacity duration-300 ease-in-out pointer-events-none border-b border-border bg-background/95 backdrop-blur',
          isAtTop ? 'opacity-0' : 'opacity-100'
        )}
      />

      {/* Content Layer */}
      <div className="relative flex h-12 items-center justify-between gap-3 px-6">
        <div className="flex min-w-0 flex-1 items-center overflow-hidden">
          <div
            className={cn(
              'truncate text-lg font-bold text-foreground transition-all duration-300 ease-in-out',
              isAtTop ? 'translate-y-4 opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'
            )}
          >
            {title}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onToggleStarred}
            title={entry.starred ? t('entry.remove_from_starred') : t('entry.add_to_starred')}
            className={cn(
              'no-drag-region flex size-9 items-center justify-center rounded-lg transition-colors',
              entry.starred
                ? 'text-amber-500 hover:bg-amber-500/10'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            <svg
              className="size-5"
              viewBox="0 0 24 24"
              fill={entry.starred ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
              />
            </svg>
          </button>

          {onToggleSummary && (
            <button
              type="button"
              onClick={onToggleSummary}
              title={
                isLoadingSummary
                  ? t('entry.cancel_summary')
                  : hasSummary
                    ? t('entry.hide_summary')
                    : t('entry.generate_summary')
              }
              className={cn(
                'no-drag-region flex size-9 items-center justify-center rounded-lg transition-colors',
                hasSummary
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              {isLoadingSummary ? (
                <div className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <svg
                  className="size-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
              )}
            </button>
          )}

          {onToggleTranslation && (
            <button
              type="button"
              onClick={onToggleTranslation}
              title={
                isTranslating
                  ? t('entry.cancel_translation')
                  : hasTranslation
                    ? t('entry.show_original')
                    : t('entry.translate_article')
              }
              className={cn(
                'no-drag-region flex size-9 items-center justify-center rounded-lg transition-colors',
                hasTranslation
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              {isTranslating ? (
                <div className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <svg
                  className="size-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
                  />
                </svg>
              )}
            </button>
          )}

          {entry.url && (
            <button
              type="button"
              onClick={onToggleReadable}
              disabled={isLoading}
              title={error || (isReadableActive ? t('entry.show_original') : t('entry.show_readable'))}
              className={cn(
                'no-drag-region flex size-9 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                error
                  ? 'text-destructive hover:bg-destructive/10'
                  : isReadableActive
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <svg
                className={cn('size-5', isLoading && 'animate-spin')}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                {isLoading ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                )}
              </svg>
            </button>
          )}

          {safeUrl && (
            <a
              href={safeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="no-drag-region flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label={t('entry.open_original')}
            >
              <svg
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
