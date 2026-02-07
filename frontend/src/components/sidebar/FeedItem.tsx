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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { RssIcon, ErrorIcon } from '@/components/ui/icons'
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
  onEdit?: (feedId: string) => void
  onDelete?: (feedId: string) => void
  onMoveToFolder?: (feedId: string, folderId: string | null) => void
  onChangeType?: (feedId: string, type: ContentType) => void
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
  onEdit,
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
          className={cn(feedItemStyles, 'group relative justify-between py-0.5 pr-2', className)}
          onClick={onClick}
          {...contextMenuProps}
        >
          <div className={cn('flex min-w-0 items-center', hasError && 'text-red-500 dark:text-red-400')}>
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
            <span className="ml-2 min-w-0 truncate">{name}</span>
            {hasError && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="ml-1 flex shrink-0 cursor-default">
                    <ErrorIcon className="size-3.5 text-red-500" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right">{errorMessage}</TooltipContent>
              </Tooltip>
            )}
          </div>
          {unreadCount !== undefined && unreadCount > 0 && (
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
        {onEdit && (
          <ContextMenuItem onClick={() => onEdit(feedId)}>
            {t('actions.edit')}
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
