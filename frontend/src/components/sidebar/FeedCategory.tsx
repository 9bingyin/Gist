import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
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

function ChevronIcon({ className }: { className?: string }) {
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
      <path d="M9 18l6-6-6-6" />
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
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div>
      {/* Category header */}
      <div
        data-active={isSelected}
        className={cn(feedItemStyles, 'group relative py-0.5 pl-2.5')}
        onClick={onSelect}
      >
        {/* Arrow button - only this toggles expand/collapse */}
        <button
          type="button"
          data-state={open ? 'open' : 'closed'}
          className="chevron-group flex h-full items-center"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation()
            toggle()
          }}
        >
          <span className={sidebarItemIconStyles}>
            <ChevronIcon className="size-4 transition-transform duration-200 [[data-state=open]>&]:rotate-90" />
          </span>
        </button>
        {/* Folder name - clicking selects the folder */}
        <span className="grow truncate font-semibold">{name}</span>
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
            {onChangeType && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>{t('actions.change_type')}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => onChangeType(folderId, 'article')}>
                    {t('content_type.article')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onChangeType(folderId, 'picture')}>
                    {t('content_type.picture')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onChangeType(folderId, 'notification')}>
                    {t('content_type.notification')}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            {onDelete && (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onDelete(folderId)}
              >
                {t('actions.delete')}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

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
