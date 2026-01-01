import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { feedItemStyles, sidebarItemIconStyles } from './styles'
import type { ContentType, Folder } from '@/types/api'

interface FeedItemProps {
  name: string
  feedId: string
  iconPath?: string
  unreadCount?: number
  isActive?: boolean
  errorMessage?: string
  onClick?: () => void
  className?: string
  folders?: Folder[]
  onRefresh?: (feedId: string) => void
  onDelete?: (feedId: string) => void
  onMoveToFolder?: (feedId: string, folderId: string | null) => void
  onChangeType?: (feedId: string, type: ContentType) => void
}

function RssIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 11a9 9 0 0 1 9 9" />
      <path d="M4 4a16 16 0 0 1 16 16" />
      <circle cx="5" cy="19" r="1" />
    </svg>
  )
}

function ErrorIcon({ className, title }: { className?: string; title?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      {title && <title>{title}</title>}
      <path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z" />
    </svg>
  )
}

function MoreHorizontalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  )
}

export function FeedItem({
  name,
  feedId,
  iconPath,
  unreadCount,
  isActive = false,
  errorMessage,
  onClick,
  className,
  folders = [],
  onRefresh,
  onDelete,
  onMoveToFolder,
  onChangeType,
}: FeedItemProps) {
  const [iconError, setIconError] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const hasError = !!errorMessage

  return (
    <div
      data-active={isActive}
      className={cn(feedItemStyles, 'group relative py-0.5', className)}
      onClick={onClick}
    >
      <div className={cn('flex min-w-0 flex-1 items-center gap-2', hasError && 'text-red-500')}>
        <span className={sidebarItemIconStyles}>
          {iconPath && !iconError ? (
            <img
              src={`/icons/${iconPath}`}
              alt=""
              className="size-4 rounded-sm object-cover"
              onError={() => setIconError(true)}
            />
          ) : (
            <RssIcon className="size-4 text-muted-foreground" />
          )}
        </span>
        <span className="truncate">{name}</span>
        {hasError && <ErrorIcon className="ml-1 size-4 shrink-0" title={errorMessage} />}
      </div>
      {unreadCount !== undefined && unreadCount > 0 && (
        <span className={cn(
          'ml-2 shrink-0 text-[0.65rem] tabular-nums text-muted-foreground transition-opacity',
          menuOpen && 'opacity-0'
        )}>
          {unreadCount}
        </span>
      )}

      {/* Hover Menu */}
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              'absolute right-1 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100',
              menuOpen && 'opacity-100'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontalIcon className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {onRefresh && (
            <DropdownMenuItem onClick={() => onRefresh(feedId)}>
              Refresh
            </DropdownMenuItem>
          )}
          {onMoveToFolder && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Move to Folder</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={() => onMoveToFolder(feedId, null)}>
                  No Folder
                </DropdownMenuItem>
                {folders.map((folder) => (
                  <DropdownMenuItem key={folder.id} onClick={() => onMoveToFolder(feedId, folder.id)}>
                    {folder.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          {onChangeType && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Change Type</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={() => onChangeType(feedId, 'article')}>
                  Article
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onChangeType(feedId, 'picture')}>
                  Picture
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onChangeType(feedId, 'notification')}>
                  Notification
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          {onDelete && (
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDelete(feedId)}
            >
              Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
