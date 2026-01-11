import React, { useEffect } from 'react'
import { motion, useMotionValue, useSpring, useTransform, AnimatePresence } from 'framer-motion'
import { useEdgeSwipe } from '@/hooks/useEdgeSwipe'

interface SwipeBackViewProps {
  children: React.ReactNode
  onBack: () => void
  enabled?: boolean
}

/**
 * A container that provides iOS-style swipe back gesture.
 */
export function SwipeBackView({ children, onBack, enabled = true }: SwipeBackViewProps) {
  const x = useMotionValue(0)
  
  // Create a darker overlay opacity based on x position
  const overlayOpacity = useTransform(x, [0, 300], [0, 0.4])
  const shadowOpacity = useTransform(x, [0, 20], [0, 1])

  const springX = useSpring(x, {
    stiffness: 400,
    damping: 40,
    mass: 0.8
  })

  const { deltaX, isSwiping, handlers } = useEdgeSwipe(onBack, {
    edgeWidth: 30,
    threshold: 120,
    velocityThreshold: 0.4
  })

  useEffect(() => {
    if (enabled && isSwiping) {
      x.set(deltaX)
    } else {
      x.set(0)
    }
  }, [deltaX, isSwiping, enabled, x])

  if (!enabled) {
    return <div className="h-full w-full">{children}</div>
  }

  return (
    <div 
      className="relative h-full w-full overflow-hidden"
      {...handlers}
    >
      {/* Background Dimmer */}
      <AnimatePresence>
        {isSwiping && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ opacity: overlayOpacity }}
            className="absolute inset-0 z-0 bg-black pointer-events-none"
          />
        )}
      </AnimatePresence>

      <motion.div
        style={{ x: springX }}
        className="relative z-10 h-full w-full bg-background overflow-hidden"
      >
        {/* Left edge shadow gradient - visible only when swiping */}
        <motion.div 
          style={{ opacity: shadowOpacity }}
          className="absolute left-0 top-0 bottom-0 w-6 -translate-x-full pointer-events-none shadow-[10px_0_15px_-3px_rgba(0,0,0,0.2)]"
        />
        {children}
      </motion.div>
    </div>
  )
}
