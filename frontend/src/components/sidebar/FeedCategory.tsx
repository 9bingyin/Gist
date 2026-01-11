import { useCallback, useRef, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
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
import { ChevronIcon } from '@/components/ui/icons'
import { useContextMenu } from '@/hooks/useContextMenu'
import { useCategoryState } from '@/hooks/useCategoryState'
import { feedItemStyles, sidebarItemIconStyles } from './styles'
import type { ContentType } from '@/types/api'

interface FeedCategoryProps {
  name: string
  folderId: string
  unreadCount?: number
  children: ReactNode
  defaultOpen?: boolean
  isSelected?: boolean
  onSelect?: () => void
  onDelete?: (folderId: string) => void
  onChangeType?: (folderId: string, type: ContentType) => void
}

export function FeedCategory({
  name,
  folderId,
  unreadCount,
  children,
  defaultOpen = false,
  isSelected = false,
  onSelect,
  onDelete,
  onChangeType,
}: FeedCategoryProps) {
  const { t } = useTranslation()
  const [open, , toggle] = useCategoryState(name, defaultOpen)
  const triggerRef = useRef<HTMLDivElement>(null)

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
    <div>
      {/* Category header */}
      <ContextMenu>
        <ContextMenuTrigger asChild ref={triggerRef}>
          <div
            data-active={isSelected}
            className={cn(feedItemStyles, 'group relative py-0.5 pl-2.5 pr-2')}
            onClick={onSelect}
            {...contextMenuProps}
          >
            {/* Arrow button - only this toggles expand/collapse */}
            <button
              type="button"
              className="flex h-full items-center"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation()
                toggle()
              }}
            >
              <span className={sidebarItemIconStyles}>
                <ChevronIcon className={cn('size-4 transition-transform duration-200', open && 'rotate-90')} />
              </span>
            </button>
            {/* Folder name - clicking selects the folder */}
            <span className="grow truncate font-semibold">{name}</span>
            {unreadCount !== undefined && unreadCount > 0 && (
              <span className="ml-2 shrink-0 text-[0.65rem] tabular-nums text-muted-foreground">
                {unreadCount}
              </span>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {onChangeType && (
            <ContextMenuSub>
              <ContextMenuSubTrigger>{t('actions.change_type')}</ContextMenuSubTrigger>
              <ContextMenuSubContent>
                <ContextMenuItem onClick={() => onChangeType(folderId, 'article')}>
                  {t('content_type.article')}
                </ContextMenuItem>
                <ContextMenuItem onClick={() => onChangeType(folderId, 'picture')}>
                  {t('content_type.picture')}
                </ContextMenuItem>
                <ContextMenuItem onClick={() => onChangeType(folderId, 'notification')}>
                  {t('content_type.notification')}
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
          )}
          {onDelete && (
            <ContextMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDelete(folderId)}
            >
              {t('actions.delete')}
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>

      {/* Children list with animation */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="space-y-px">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
