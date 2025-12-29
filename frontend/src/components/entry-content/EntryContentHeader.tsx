import { isSafeUrl } from '@/lib/url'
import { cn } from '@/lib/utils'
import type { Entry } from '@/types/api'

interface EntryContentHeaderProps {
  entry: Entry
  isAtTop: boolean
}

export function EntryContentHeader({ entry, isAtTop }: EntryContentHeaderProps) {
  const safeUrl = entry.url && isSafeUrl(entry.url) ? entry.url : null

  return (
    <div className="absolute inset-x-0 top-0 z-20">
      <div
        data-hide-in-print="true"
        className={cn(
          'relative flex min-w-0 items-center justify-between gap-3 overflow-hidden border-b text-lg text-muted-foreground transition-colors duration-200',
          !isAtTop && entry.title ? 'border-border' : 'border-transparent'
        )}
      >
        <nav
          data-hide-in-print="true"
          className="relative z-10 flex h-11 w-full items-center justify-between gap-3 bg-background px-4 @container"
        >
          <div className="flex min-w-0 flex-1 shrink grow">
            <div
              data-visible={!isAtTop}
              className="flex min-w-0 flex-1 shrink items-end gap-2 truncate leading-tight opacity-0 transition-opacity duration-200 data-[visible=true]:opacity-100"
            >
              <span className="shrink truncate text-lg font-bold text-foreground">
                {entry.title || 'Untitled'}
              </span>
            </div>
          </div>

          <div className="relative flex shrink-0 items-center justify-end gap-2">
            {safeUrl && (
              <a
                href={safeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="no-drag-region pointer-events-auto inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="在新标签页打开"
              >
                <svg
                  className="size-5"
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
          </div>
        </nav>
      </div>
    </div>
  )
}
