import { useRef, useCallback } from 'react'

interface UseLongPressOptions {
  onLongPress: (e: { pageX: number; pageY: number; target: EventTarget }) => void
  onClick?: (e: React.TouchEvent) => void
  onTouchMove?: (e: React.TouchEvent) => void
  onTouchEnd?: (e: React.TouchEvent) => void
  onTouchStart?: (e: React.TouchEvent) => void
  threshold?: number
}

/**
 * Hook for detecting long press on touch devices.
 * Returns touch event handlers that can be spread onto an element.
 */
export function useLongPress({
  onLongPress,
  onClick,
  threshold = 500,
  ...events
}: UseLongPressOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const isLongPress = useRef(false)
  const startPosition = useRef<{ x: number; y: number } | undefined>(undefined)

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      events.onTouchStart?.(e)
      e.preventDefault()
      isLongPress.current = false
      const touch = e.touches[0]!

      clearTimeout(timerRef.current)
      startPosition.current = {
        x: touch.clientX + window.scrollX,
        y: touch.clientY + window.scrollY,
      }

      timerRef.current = setTimeout(() => {
        isLongPress.current = true
        if (!startPosition.current) return

        const compatEvent = {
          pageX: startPosition.current.x,
          pageY: startPosition.current.y,
          target: e.target,
          preventDefault: () => {},
          stopPropagation: () => {},
          clientX: touch.clientX,
          clientY: touch.clientY,
        }

        onLongPress(compatEvent)
      }, threshold)
    },
    [events, onLongPress, threshold]
  )

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      events.onTouchMove?.(e)
      if (!startPosition.current) return

      const touch = e.touches[0]!
      const currentX = touch.clientX + window.scrollX
      const currentY = touch.clientY + window.scrollY

      const moveOffset = Math.sqrt(
        Math.pow(currentX - startPosition.current.x, 2) +
          Math.pow(currentY - startPosition.current.y, 2)
      )

      // Cancel long press if moved more than 10px
      if (moveOffset > 10) {
        clearTimeout(timerRef.current)
        startPosition.current = undefined
      }
    },
    [events]
  )

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      events.onTouchEnd?.(e)
      clearTimeout(timerRef.current)
      if (!isLongPress.current && onClick) {
        onClick(e)
      }
      startPosition.current = undefined
    },
    [events, onClick]
  )

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  }
}
