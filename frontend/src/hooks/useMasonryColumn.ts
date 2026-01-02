import { useLayoutEffect, useRef, useState } from 'react'

// Responsive breakpoints: container width -> column count
const breakpoints: Record<number, number> = {
  0: 2,
  512: 3,
  768: 4,
  1024: 5,
  1280: 6,
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

function calcItemWidth(containerWidth: number, gutter: number, column: number): number {
  return Math.floor((containerWidth - gutter * (column - 1)) / column)
}

export function useMasonryColumn(gutter: number, isMobile?: boolean) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [currentColumn, setCurrentColumn] = useState(isMobile ? 2 : 3)
  const [currentItemWidth, setCurrentItemWidth] = useState(0)
  const [isReady, setIsReady] = useState(false)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handler = () => {
      if (container.clientWidth === 0) return

      // Get computed padding to calculate actual content width
      const style = getComputedStyle(container)
      const paddingLeft = Number.parseFloat(style.paddingLeft) || 0
      const paddingRight = Number.parseFloat(style.paddingRight) || 0
      const contentWidth = container.clientWidth - paddingLeft - paddingRight

      const column = isMobile ? 2 : getCurrentColumn(contentWidth)
      const itemWidth = calcItemWidth(contentWidth, gutter, column)

      setCurrentColumn(column)
      setCurrentItemWidth(itemWidth)
      setIsReady(true)
    }

    // Initial calculation
    requestAnimationFrame(handler)

    const resizeObserver = new ResizeObserver(() => {
      handler()
    })

    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
    }
  }, [gutter, isMobile])

  return {
    containerRef,
    currentColumn,
    currentItemWidth,
    isReady,
  }
}
