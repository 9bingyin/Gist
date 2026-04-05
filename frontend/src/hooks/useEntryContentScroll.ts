import { useCallback, useLayoutEffect, useRef, useState } from 'react'

const SCROLL_TOP_THRESHOLD = 48

// Module-level cache: entryId -> scrollTop
const entryScrollPositions = new Map<string, number>()

export function useEntryContentScroll(entryId: string | null, useWindowScroll = false) {
  const [scrollNode, setScrollNode] = useState<HTMLDivElement | null>(null)
  const [isAtTop, setIsAtTop] = useState(true)
  const processedEntryIdRef = useRef<string | null>(null)

  // Callback ref - triggers when DOM node is attached/detached (desktop only)
  const scrollRef = useCallback((node: HTMLDivElement | null) => {
    setScrollNode(node)
  }, [])

  // Desktop: track scroll on inner div
  useLayoutEffect(() => {
    if (useWindowScroll) return

    // Mark this entryId as processed
    processedEntryIdRef.current = entryId

    if (!scrollNode) return

    const handleScroll = () => {
      const top = scrollNode.scrollTop
      const atTop = top < SCROLL_TOP_THRESHOLD
      setIsAtTop(atTop)
      // Save position for restoration
      if (entryId) {
        entryScrollPositions.set(entryId, top)
      }
    }

    // Restore saved position, or reset to top
    const saved = entryId ? entryScrollPositions.get(entryId) : undefined
    if (saved) {
      // eslint-disable-next-line react-hooks/immutability
      scrollNode.scrollTop = saved
      setIsAtTop(saved < SCROLL_TOP_THRESHOLD)
    } else {
      scrollNode.scrollTop = 0
      setIsAtTop(true)
    }

    scrollNode.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      scrollNode.removeEventListener('scroll', handleScroll)
    }
  }, [entryId, scrollNode, useWindowScroll])

  // Mobile: track scroll on window so the browser can auto-hide the address bar
  useLayoutEffect(() => {
    if (!useWindowScroll) return

    processedEntryIdRef.current = entryId

    const handleScroll = () => {
      const top = window.scrollY
      const atTop = top < SCROLL_TOP_THRESHOLD
      setIsAtTop(atTop)
      if (entryId) {
        entryScrollPositions.set(entryId, top)
      }
    }

    // Restore saved position, or reset to top
    const saved = entryId ? entryScrollPositions.get(entryId) : undefined
    if (saved) {
      window.scrollTo(0, saved)
      setIsAtTop(saved < SCROLL_TOP_THRESHOLD)
    } else {
      window.scrollTo(0, 0)
      setIsAtTop(true)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [entryId, useWindowScroll])

  // If entryId hasn't been processed by effect yet, force return true
  // This prevents flash when switching articles (old isAtTop value being used)
  const effectiveIsAtTop = processedEntryIdRef.current !== entryId ? true : isAtTop

  return {
    scrollRef,
    isAtTop: effectiveIsAtTop,
    scrollNode: useWindowScroll ? null : scrollNode,
  }
}
