import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

interface SheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

export function Sheet({ open, onOpenChange, children }: SheetProps) {
  // Handle escape key and body scroll lock
  useEffect(() => {
    if (!open) return

    document.body.style.overflow = 'hidden'

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onOpenChange])

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
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0.1, right: 0 }}
            onDragEnd={(_, info) => {
              if (info.offset.x < -50 || info.velocity.x < -300) {
                onOpenChange(false)
              }
            }}
            variants={{
              open: { x: 0 },
              closed: { x: '-100%' },
            }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={cn(
              'fixed inset-y-0 left-0 z-50 bg-sidebar shadow-xl',
              'w-[280px] safe-area-top',
              'touch-none'
            )}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
