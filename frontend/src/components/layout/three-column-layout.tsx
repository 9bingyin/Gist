import { type ReactNode, useMemo, useRef, useEffect, useCallback, useState } from 'react'
import { PanelSplitter } from '@/components/ui/panel-splitter'
import { cn } from '@/lib/utils'
import {
  getUISettings,
  setUISetting,
  defaultUISettings,
  useUISettingKey,
} from '@/hooks/useUISettings'

const FEED_COL_MIN = 256
const FEED_COL_MAX = 300
const ENTRY_COL_MIN = 300

interface UseResizableOptions {
  axis: 'x' | 'y'
  initial: number
  min: number
  max: number
  onResizeEnd?: (position: number) => void
}

function useResizable({
  axis,
  initial,
  min,
  max,
  onResizeEnd,
}: UseResizableOptions) {
  const [position, setPosition] = useState(initial)
  const [isDragging, setIsDragging] = useState(false)
  const startPosRef = useRef(0)
  const startValueRef = useRef(0)

  // Sync with external changes
  useEffect(() => {
    setPosition(initial)
  }, [initial])

  // Extract position from mouse/pointer/touch events
  const getEventPosition = useCallback(
    (e: MouseEvent | PointerEvent | TouchEvent) => {
      if ('touches' in e && e.touches.length > 0) {
        return axis === 'x' ? e.touches[0]!.clientX : e.touches[0]!.clientY
      }
      return axis === 'x' ? (e as MouseEvent).clientX : (e as MouseEvent).clientY
    },
    [axis]
  )

  const handleDragStart = useCallback(
    (e: React.PointerEvent | React.TouchEvent) => {
      e.preventDefault()
      setIsDragging(true)
      const pos = getEventPosition(e.nativeEvent as PointerEvent | TouchEvent)
      startPosRef.current = pos
      startValueRef.current = position
    },
    [position, getEventPosition]
  )

  const handleDoubleClick = useCallback(() => {
    // Will be handled by parent
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const handleMove = (e: MouseEvent | PointerEvent | TouchEvent) => {
      const currentPos = getEventPosition(e)
      const delta = currentPos - startPosRef.current
      const newValue = Math.min(max, Math.max(min, startValueRef.current + delta))
      setPosition(newValue)
    }

    const handleEnd = () => {
      setIsDragging(false)
      onResizeEnd?.(position)
    }

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      handleMove(e)
    }

    // Pointer events (primary, works on most modern devices)
    document.addEventListener('pointermove', handleMove)
    document.addEventListener('pointerup', handleEnd)
    document.addEventListener('pointercancel', handleEnd)

    // Touch events (fallback for older devices)
    document.addEventListener('touchmove', handleTouchMove, { passive: false })
    document.addEventListener('touchend', handleEnd)
    document.addEventListener('touchcancel', handleEnd)

    // Change cursor during drag
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'

    return () => {
      document.removeEventListener('pointermove', handleMove)
      document.removeEventListener('pointerup', handleEnd)
      document.removeEventListener('pointercancel', handleEnd)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleEnd)
      document.removeEventListener('touchcancel', handleEnd)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isDragging, min, max, onResizeEnd, position, getEventPosition])

  return {
    position,
    isDragging,
    separatorProps: {
      onPointerDown: handleDragStart,
      onTouchStart: handleDragStart,
      onDoubleClick: handleDoubleClick,
    },
    setPosition,
  }
}

interface ThreeColumnLayoutProps {
  sidebar?: ReactNode
  list?: ReactNode
  content?: ReactNode
  className?: string
  hideList?: boolean
  showSidebar?: boolean
}

export function ThreeColumnLayout({
  sidebar,
  list,
  content,
  className,
  hideList = false,
  showSidebar = true,
}: ThreeColumnLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1200
  )

  // Get stored feed column width for dynamic max calculation
  const storedFeedColWidth = useUISettingKey('feedColWidth')

  // Calculate dynamic max for entry column
  const entryColMax = useMemo(() => {
    // (windowWidth - feedColWidth - splitters) / 2
    // This ensures content area always has at least half the remaining space
    // When sidebar is hidden, don't subtract its width
    const sidebarWidth = showSidebar ? storedFeedColWidth : 0
    return Math.max(ENTRY_COL_MIN, Math.floor((windowWidth - sidebarWidth - 12) / 2))
  }, [windowWidth, storedFeedColWidth, showSidebar])

  // Track window resize
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Initial values from storage
  const feedColInitial = useMemo(() => getUISettings().feedColWidth, [])
  const entryColInitial = useMemo(() => {
    const stored = getUISettings().entryColWidth
    // Clamp to valid range
    return Math.min(Math.max(stored, ENTRY_COL_MIN), entryColMax)
  }, [entryColMax])

  const feedColResizable = useResizable({
    axis: 'x',
    initial: feedColInitial,
    min: FEED_COL_MIN,
    max: FEED_COL_MAX,
    onResizeEnd: (position) => {
      setUISetting('feedColWidth', position)
    },
  })

  const entryColResizable = useResizable({
    axis: 'x',
    initial: entryColInitial,
    min: ENTRY_COL_MIN,
    max: entryColMax,
    onResizeEnd: (position) => {
      setUISetting('entryColWidth', position)
    },
  })

  // Double-click handlers to reset to defaults
  const handleFeedColDoubleClick = useCallback(() => {
    setUISetting('feedColWidth', defaultUISettings.feedColWidth)
    feedColResizable.setPosition(defaultUISettings.feedColWidth)
  }, [feedColResizable])

  const handleEntryColDoubleClick = useCallback(() => {
    setUISetting('entryColWidth', defaultUISettings.entryColWidth)
    entryColResizable.setPosition(defaultUISettings.entryColWidth)
  }, [entryColResizable])

  return (
    <div
      ref={containerRef}
      className={cn('flex h-screen w-screen overflow-hidden', className)}
      style={{
        // CSS custom property for potential use by child components
        '--feed-col-width': `${feedColResizable.position}px`,
        '--entry-col-width': `${entryColResizable.position}px`,
      } as React.CSSProperties}
    >
      {/* Sidebar - left column (Feed list) - always rendered but animated in/out */}
      <aside
        className={cn(
          'flex h-full shrink-0 flex-col overflow-hidden bg-sidebar safe-area-top safe-area-left',
          'ease-[var(--ease-ios)]',
          // Transition only when not dragging
          !feedColResizable.isDragging && 'motion-reduce:transition-none',
          !feedColResizable.isDragging && 'transition-[width,opacity,transform]',
          // Show/hide animation states
          showSidebar
            ? 'opacity-100 translate-x-0 w-[calc(var(--feed-col-width)+env(safe-area-inset-left,0px))] duration-[var(--duration-sidebar-expand)]'
            : 'w-0 opacity-0 -translate-x-2 pointer-events-none duration-[var(--duration-sidebar-collapse)]'
        )}
      >
        {sidebar}
      </aside>

      {/* First splitter - also animated */}
      <div
        className={cn(
          'relative h-full shrink-0 z-30 ease-[var(--ease-ios)]',
          !feedColResizable.isDragging && 'motion-reduce:transition-none',
          !feedColResizable.isDragging && 'transition-[width,opacity]',
          showSidebar
            ? 'w-0 opacity-100 duration-[var(--duration-sidebar-expand)]'
            : 'w-0 opacity-0 pointer-events-none duration-[var(--duration-sidebar-collapse)]'
        )}
      >
        {showSidebar && (
          <PanelSplitter
            isDragging={feedColResizable.isDragging}
            onPointerDown={feedColResizable.separatorProps.onPointerDown}
            onTouchStart={feedColResizable.separatorProps.onTouchStart}
            onDoubleClick={handleFeedColDoubleClick}
          />
        )}
      </div>

      {/* List - middle column (Entry list) - hidden when hideList is true */}
      {!hideList && (
        <>
          <div
            className={cn(
              'flex h-full shrink-0 flex-col overflow-hidden bg-background safe-area-top w-[var(--entry-col-width)]',
              !entryColResizable.isDragging && 'transition-[width] duration-200'
            )}
          >
            {list}
          </div>

          {/* Second splitter */}
          <PanelSplitter
            isDragging={entryColResizable.isDragging}
            onPointerDown={entryColResizable.separatorProps.onPointerDown}
            onTouchStart={entryColResizable.separatorProps.onTouchStart}
            onDoubleClick={handleEntryColDoubleClick}
          />
        </>
      )}

      {/* Content - right column (Entry content) */}
      <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-background safe-area-top">
        {content}
      </main>
    </div>
  )
}
