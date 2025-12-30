import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { useCategoryState } from '@/hooks/useCategoryState'
import { feedItemStyles, sidebarItemIconStyles } from './styles'

interface FeedCategoryProps {
  name: string
  unreadCount?: number
  children: ReactNode
  defaultOpen?: boolean
  isSelected?: boolean
  onSelect?: () => void
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

export function FeedCategory({
  name,
  unreadCount,
  children,
  defaultOpen = false,
  isSelected = false,
  onSelect,
}: FeedCategoryProps) {
  const [open, , toggle] = useCategoryState(name, defaultOpen)

  return (
    <div>
      {/* Category header */}
      <div
        data-active={isSelected}
        className={cn(feedItemStyles, 'py-0.5 pl-2.5')}
        onClick={onSelect}
      >
        {/* Arrow button - only this toggles expand/collapse */}
        <button
          type="button"
          data-state={open ? 'open' : 'closed'}
          className="group flex h-full items-center"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation()
            toggle()
          }}
        >
          <span className={sidebarItemIconStyles}>
            <ChevronIcon className="size-4 transition-transform duration-200 group-data-[state=open]:rotate-90" />
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
