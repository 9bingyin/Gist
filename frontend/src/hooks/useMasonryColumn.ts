import { useLayoutEffect, useRef, useState, type RefObject } from 'react'

// Responsive breakpoints: container width -> column count
const breakpoints: Record<number, number> = {
  0: 2,
  512: 3,
  768: 4,
  1024: 5,
  1280: 6,
}

interface MasonryColumnState {
  containerRef: RefObject<HTMLDivElement | null>
  currentColumn: number
  isReady: boolean
}

function getCurrentColumn(width: number): number {
  let columns = 2
  for (const [breakpoint, cols] of Object.entries(breakpoints)) {
    if (width >= Number.parseInt(breakpoint)) {
      columns = cols
    } else {
      break
    }
  }
  return columns
}

export function useMasonryColumn(
  isMobile?: boolean,
  externalContainerRef?: RefObject<HTMLDivElement | null>
): MasonryColumnState {
  const internalContainerRef = useRef<HTMLDivElement>(null)
  const containerRef = externalContainerRef ?? internalContainerRef
  const [currentColumn, setCurrentColumn] = useState(isMobile ? 2 : 3)
  const [isReady, setIsReady] = useState(false)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    let frameId: number | null = null

    const handler = () => {
      if (container.clientWidth === 0) return

      const style = getComputedStyle(container)
      const paddingLeft = Number.parseFloat(style.paddingLeft) || 0
      const paddingRight = Number.parseFloat(style.paddingRight) || 0
      const contentWidth = container.clientWidth - paddingLeft - paddingRight

      const column = isMobile ? 2 : getCurrentColumn(contentWidth)

      setCurrentColumn((currentColumn) => (
        currentColumn === column ? currentColumn : column
      ))
      setIsReady(true)
    }

    const scheduleHandler = () => {
      if (frameId !== null) return
      frameId = requestAnimationFrame(() => {
        frameId = null
        handler()
      })
    }

    scheduleHandler()

    const resizeObserver = new ResizeObserver(() => {
      scheduleHandler()
    })

    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
      if (frameId !== null) {
        cancelAnimationFrame(frameId)
      }
    }
  }, [containerRef, isMobile])

  return {
    containerRef,
    currentColumn,
    isReady,
  }
}
