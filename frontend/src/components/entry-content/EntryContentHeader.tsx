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
            {entry.title || 'Untitled'}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {safeUrl && (
            <a
              href={safeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="no-drag-region flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="在新标签页打开"
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
