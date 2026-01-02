import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

interface AiSummaryBoxProps {
  content: string | null
  isLoading?: boolean
  error?: string | null
}

export function AiSummaryBox({ content, isLoading, error }: AiSummaryBoxProps) {
  const { t } = useTranslation()

  if (!content && !isLoading && !error) return null

  return (
    <div
      className={cn(
        'rounded-lg border p-4 sm:p-5 mb-6 overflow-hidden break-words',
        error
          ? 'border-destructive/30 bg-destructive/5'
          : 'border-primary/20 bg-primary/5'
      )}
    >
      <div className="flex items-center gap-2 mb-3">
        <svg
          className={cn('size-4', error ? 'text-destructive' : 'text-primary')}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          />
        </svg>
        <h3 className={cn('text-sm font-semibold', error ? 'text-destructive' : 'text-primary')}>
          {t('entry.ai_summary')}
        </h3>
        {isLoading && (
          <div className="size-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        )}
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <div className="text-sm leading-relaxed space-y-2">
          {content?.split('\n').filter(line => line.trim()).map((point, i) => (
            <p key={i}>{point.trim()}</p>
          ))}
          {isLoading && !content && (
            <div className="space-y-2">
              <div className="h-4 w-full bg-primary/10 rounded animate-pulse" />
              <div className="h-4 w-3/4 bg-primary/10 rounded animate-pulse" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
