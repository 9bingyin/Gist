import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useCategoryState } from '@/hooks/useCategoryState'
import { categoryHeaderStyles } from './styles'

interface FeedCategoryProps {
  name: string
  unreadCount?: number
  children: ReactNode
  defaultOpen?: boolean
  isSelected?: boolean
  onSelect?: () => void
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
      {/* Category header - clickable to expand/collapse */}
      <div
        data-active={isSelected}
        className={categoryHeaderStyles}
        onClick={() => {
          if (onSelect) {
            onSelect()
          } else {
            toggle()
          }
        }}
        onDoubleClick={toggle}
      >
        <button
          type="button"
          data-state={open ? 'open' : 'close'}
          className="flex h-8 items-center [&_svg]:data-[state=open]:rotate-90"
          tabIndex={-1}
        >
          <div className="mr-2 flex size-4 items-center justify-center">
            <svg
              className="size-3 transition-transform duration-200"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </div>
        </button>
        <span className="grow truncate">{name}</span>
        {unreadCount !== undefined && unreadCount > 0 && (
          <span className="ml-2 text-xs tabular-nums text-muted-foreground">
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
            <div className="space-y-px pl-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
