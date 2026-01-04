import { useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { useContextMenu } from '@/hooks/useContextMenu'
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
  const { t } = useTranslation()
  const [iconError, setIconError] = useState(false)
  const hasError = !!errorMessage
  const triggerRef = useRef<HTMLSpanElement>(null)

  const handleContextMenu = useCallback(
    (e: React.MouseEvent | { pageX: number; pageY: number }) => {
      // Programmatically trigger the context menu for long press
      if (!('button' in e) && triggerRef.current) {
        triggerRef.current.dispatchEvent(
          new MouseEvent('contextmenu', {
            bubbles: true,
            clientX: e.pageX,
            clientY: e.pageY,
          })
        )
      }
    },
    []
  )

  const contextMenuProps = useContextMenu({
    onContextMenu: handleContextMenu,
  })

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild ref={triggerRef}>
        <div
          data-active={isActive}
          className={cn(feedItemStyles, 'group relative py-0.5 pr-2', className)}
          onClick={onClick}
          {...contextMenuProps}
        >
          <div className={cn('flex min-w-0 flex-1 items-center gap-2', hasError && 'text-red-500 dark:text-red-400')}>
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
          </div>
          {hasError && <ErrorIcon className="shrink-0 size-3.5 text-red-500" title={errorMessage} />}
          {unreadCount !== undefined && unreadCount > 0 && !hasError && (
            <span className="shrink-0 text-[0.65rem] tabular-nums text-muted-foreground">
              {unreadCount}
            </span>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {onRefresh && (
          <ContextMenuItem onClick={() => onRefresh(feedId)}>
            {t('actions.refresh')}
          </ContextMenuItem>
        )}
        {onMoveToFolder && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>{t('actions.move_to_folder')}</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem onClick={() => onMoveToFolder(feedId, null)}>
                {t('actions.no_folder')}
              </ContextMenuItem>
              {folders.map((folder) => (
                <ContextMenuItem key={folder.id} onClick={() => onMoveToFolder(feedId, folder.id)}>
                  {folder.name}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}
        {onChangeType && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>{t('actions.change_type')}</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem onClick={() => onChangeType(feedId, 'article')}>
                {t('content_type.article')}
              </ContextMenuItem>
              <ContextMenuItem onClick={() => onChangeType(feedId, 'picture')}>
                {t('content_type.picture')}
              </ContextMenuItem>
              <ContextMenuItem onClick={() => onChangeType(feedId, 'notification')}>
                {t('content_type.notification')}
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}
        {onDelete && (
          <ContextMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => onDelete(feedId)}
          >
            {t('actions.delete')}
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
