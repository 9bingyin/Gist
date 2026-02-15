import { useRef, useCallback, useEffect } from 'react'

export type SwipeDirection = 'left' | 'right' | 'up' | 'down'

interface UseSwipeGestureOptions {
  onSwipe?: (direction: SwipeDirection) => void
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  onSwipeUp?: () => void
  onSwipeDown?: () => void
  threshold?: number // Minimum distance for a swipe (px)
  velocityThreshold?: number // Minimum velocity for a swipe (px/ms)
  enabledDirections?: SwipeDirection[] // Which directions to detect
  preventScroll?: boolean // Prevent default scroll behavior during horizontal swipe
  enabled?: boolean // Whether to register touch listeners (default true)
}

interface TouchState {
  startX: number
  startY: number
  startTime: number
  currentX: number
  currentY: number
  isScrolling: boolean | null // null = undetermined, true = vertical scroll, false = horizontal swipe
}

export function useSwipeGesture(
  elementRef: React.RefObject<HTMLElement | null>,
  options: UseSwipeGestureOptions = {}
) {
  const {
    onSwipe,
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    threshold = 50,
    velocityThreshold = 0.3,
    enabledDirections = ['left', 'right', 'up', 'down'],
    preventScroll = true,
    enabled = true,
  } = options

  const touchState = useRef<TouchState | null>(null)

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0]
    if (!touch) return

    touchState.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: Date.now(),
      currentX: touch.clientX,
      currentY: touch.clientY,
      isScrolling: null,
    }
  }, [])

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!touchState.current) return

      const touch = e.touches[0]
      if (!touch) return

      touchState.current.currentX = touch.clientX
      touchState.current.currentY = touch.clientY

      // Determine if this is a scroll or swipe on first significant move
      if (touchState.current.isScrolling === null) {
        const deltaX = Math.abs(touch.clientX - touchState.current.startX)
        const deltaY = Math.abs(touch.clientY - touchState.current.startY)

        // Need at least 10px movement to determine direction
        if (deltaX > 10 || deltaY > 10) {
          // If vertical movement is greater, it's a scroll
          touchState.current.isScrolling = deltaY > deltaX
        }
      }

      // If determined to be horizontal swipe and preventScroll is enabled, prevent default
      if (
        preventScroll &&
        touchState.current.isScrolling === false &&
        (enabledDirections.includes('left') || enabledDirections.includes('right'))
      ) {
        e.preventDefault()
      }
    },
    [preventScroll, enabledDirections]
  )

  const handleTouchEnd = useCallback(() => {
    if (!touchState.current) return

    // Don't trigger swipe if it's a scroll gesture
    if (touchState.current.isScrolling === true) {
      touchState.current = null
      return
    }

    const deltaX = touchState.current.currentX - touchState.current.startX
    const deltaY = touchState.current.currentY - touchState.current.startY
    const deltaTime = Math.max(1, Date.now() - touchState.current.startTime) // Prevent division by zero

    const absX = Math.abs(deltaX)
    const absY = Math.abs(deltaY)
    const velocity = Math.max(absX, absY) / deltaTime

    let direction: SwipeDirection | null = null

    // Horizontal swipe detection
    if (absX > absY) {
      if (absX > threshold || velocity > velocityThreshold) {
        if (deltaX > 0 && enabledDirections.includes('right')) {
          direction = 'right'
          onSwipeRight?.()
        } else if (deltaX < 0 && enabledDirections.includes('left')) {
          direction = 'left'
          onSwipeLeft?.()
        }
      }
    }
    // Vertical swipe detection
    else {
      if (absY > threshold || velocity > velocityThreshold) {
        if (deltaY > 0 && enabledDirections.includes('down')) {
          direction = 'down'
          onSwipeDown?.()
        } else if (deltaY < 0 && enabledDirections.includes('up')) {
          direction = 'up'
          onSwipeUp?.()
        }
      }
    }

    if (direction) {
      onSwipe?.(direction)
    }

    touchState.current = null
  }, [
    threshold,
    velocityThreshold,
    enabledDirections,
    onSwipe,
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
  ])

  useEffect(() => {
    const element = elementRef.current
    if (!element || !enabled) {
      touchState.current = null
      return
    }

    element.addEventListener('touchstart', handleTouchStart, { passive: true })
    element.addEventListener('touchmove', handleTouchMove, { passive: false })
    element.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      element.removeEventListener('touchstart', handleTouchStart)
      element.removeEventListener('touchmove', handleTouchMove)
      element.removeEventListener('touchend', handleTouchEnd)
    }
  }, [elementRef, enabled, handleTouchStart, handleTouchMove, handleTouchEnd])
}
