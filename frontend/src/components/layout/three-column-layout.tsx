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

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setIsDragging(true)
      startPosRef.current = axis === 'x' ? e.clientX : e.clientY
      startValueRef.current = position
    },
    [axis, position]
  )

  const handleDoubleClick = useCallback(() => {
    // Will be handled by parent
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const currentPos = axis === 'x' ? e.clientX : e.clientY
      const delta = currentPos - startPosRef.current
      const newValue = Math.min(max, Math.max(min, startValueRef.current + delta))
      setPosition(newValue)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      onResizeEnd?.(position)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    // Change cursor during drag
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isDragging, axis, min, max, onResizeEnd, position])

  return {
    position,
    isDragging,
    separatorProps: {
      onMouseDown: handleMouseDown,
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
}

export function ThreeColumnLayout({
  sidebar,
  list,
  content,
  className,
  hideList = false,
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
    return Math.max(ENTRY_COL_MIN, Math.floor((windowWidth - storedFeedColWidth - 12) / 2))
  }, [windowWidth, storedFeedColWidth])

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
      } as React.CSSProperties}
    >
      {/* Sidebar - left column (Feed list) */}
      <aside
        className={cn(
          'flex h-full shrink-0 flex-col overflow-hidden bg-sidebar safe-area-top safe-area-left',
          !feedColResizable.isDragging && 'transition-[width] duration-200'
        )}
        style={{ width: `calc(${feedColResizable.position}px + env(safe-area-inset-left, 0px))` }}
      >
        {sidebar}
      </aside>

      {/* First splitter */}
      <PanelSplitter
        isDragging={feedColResizable.isDragging}
        onMouseDown={feedColResizable.separatorProps.onMouseDown}
        onDoubleClick={handleFeedColDoubleClick}
      />

      {/* List - middle column (Entry list) - hidden when hideList is true */}
      {!hideList && (
        <>
          <div
            className={cn(
              'flex h-full shrink-0 flex-col overflow-hidden bg-background safe-area-top',
              !entryColResizable.isDragging && 'transition-[width] duration-200'
            )}
            style={{ width: entryColResizable.position }}
          >
            {list}
          </div>

          {/* Second splitter */}
          <PanelSplitter
            isDragging={entryColResizable.isDragging}
            onMouseDown={entryColResizable.separatorProps.onMouseDown}
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
