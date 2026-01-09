import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

interface SheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

export function Sheet({ open, onOpenChange, children }: SheetProps) {
  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onOpenChange(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onOpenChange])

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="sheet-container"
          initial="closed"
          animate="open"
          exit="closed"
        >
          {/* Overlay */}
          <motion.div
            variants={{
              open: { opacity: 1 },
              closed: { opacity: 0 },
            }}
            transition={{ duration: 0.2 }}
            className={cn(
              'fixed z-50 bg-black/50',
              // Extend to cover safe area (notch/home indicator)
              'top-[calc(-1*env(safe-area-inset-top,0px))]',
              'bottom-[calc(-1*env(safe-area-inset-bottom,0px))]',
              'left-[calc(-1*env(safe-area-inset-left,0px))]',
              'right-[calc(-1*env(safe-area-inset-right,0px))]'
            )}
            onClick={() => onOpenChange(false)}
          />

          {/* Sheet content */}
          <motion.div
            variants={{
              open: { x: 0 },
              closed: { x: '-100%' },
            }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={cn(
              'fixed inset-y-0 left-0 z-50 bg-sidebar shadow-xl',
              // Width includes safe area for landscape mode
              'w-[calc(280px+env(safe-area-inset-left,0px))]',
              // Padding for safe area (top for portrait, left for landscape)
              'pt-[env(safe-area-inset-top,0px)]',
              'pl-[env(safe-area-inset-left,0px)]',
              'pb-[env(safe-area-inset-bottom,0px)]'
            )}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
