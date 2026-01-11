import { useState, useRef, useCallback, useEffect } from 'react'

export interface EdgeSwipeConfig {
  edgeWidth?: number       // 边缘检测区域宽度 (px)
  threshold?: number       // 触发操作的最小滑动距离 (px)
  velocityThreshold?: number // 触发操作的最小速度 (px/ms)
}

export interface EdgeSwipeResult {
  deltaX: number           // 当前滑动距离
  progress: number         // 滑动进度 (0-1)
  isSwiping: boolean       // 是否正在滑动
  handlers: {
    onTouchStart: (e: React.TouchEvent) => void
    onTouchMove: (e: React.TouchEvent) => void
    onTouchEnd: (e: React.TouchEvent) => void
  }
}

/**
 * Hook for detecting edge swipe gestures (left edge to right)
 */
export function useEdgeSwipe(
  onSwipeComplete?: () => void,
  config: EdgeSwipeConfig = {}
): EdgeSwipeResult {
  const {
    edgeWidth = 20,
    threshold = 100,
    velocityThreshold = 0.5,
  } = config

  const [deltaX, setDeltaX] = useState(0)
  const [isSwiping, setIsSwiping] = useState(false)
  
  const startXRef = useRef(0)
  const startYRef = useRef(0)
  const startTimeRef = useRef(0)
  const isEligibleRef = useRef(false) // Whether current touch started at the edge

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    
    // Check if touch started at the left edge
    if (touch.clientX <= edgeWidth) {
      isEligibleRef.current = true
      startXRef.current = touch.clientX
      startYRef.current = touch.clientY
      startTimeRef.current = Date.now()
      setDeltaX(0)
    } else {
      isEligibleRef.current = false
    }
  }, [edgeWidth])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isEligibleRef.current) return

    const touch = e.touches[0]
    const currentDeltaX = touch.clientX - startXRef.current
    const currentDeltaY = touch.clientY - startYRef.current

    // Only start swiping if horizontal movement is dominant
    if (!isSwiping) {
      if (currentDeltaX > 10 && Math.abs(currentDeltaX) > Math.abs(currentDeltaY)) {
        setIsSwiping(true)
        // Prevent default scrolling once swipe is confirmed
        if (e.cancelable) e.preventDefault()
      } else if (Math.abs(currentDeltaY) > 10) {
        // Vertical movement detected, disqualify this swipe
        isEligibleRef.current = false
      }
      return
    }

    // Update progress (clamped to positive)
    if (currentDeltaX >= 0) {
      setDeltaX(currentDeltaX)
      if (e.cancelable) e.preventDefault()
    }
  }, [isSwiping])

  const onTouchEnd = useCallback(() => {
    if (!isEligibleRef.current || !isSwiping) {
      isEligibleRef.current = false
      setIsSwiping(false)
      setDeltaX(0)
      return
    }

    const duration = Date.now() - startTimeRef.current
    const velocity = deltaX / duration

    // Trigger complete if swiped past threshold OR velocity is high enough
    if (deltaX >= threshold || velocity >= velocityThreshold) {
      onSwipeComplete?.()
    }

    // Reset state
    setIsSwiping(false)
    setDeltaX(0)
    isEligibleRef.current = false
  }, [deltaX, isSwiping, onSwipeComplete, threshold, velocityThreshold])

  // Clean up if component unmounts
  useEffect(() => {
    return () => {
      setIsSwiping(false)
      setDeltaX(0)
    }
  }, [])

  return {
    deltaX,
    progress: Math.min(Math.max(deltaX / threshold, 0), 1),
    isSwiping,
    handlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
    },
  }
}
