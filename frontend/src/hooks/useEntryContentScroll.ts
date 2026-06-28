import { useCallback, useLayoutEffect, useRef, useState } from 'react'

const SCROLL_TOP_THRESHOLD = 48
const POSITION_CACHE_SIZE = 5
const SESSION_KEY = 'gist.entryScrollPositions'

/** LRU cache capped at POSITION_CACHE_SIZE entries, backed by sessionStorage. */
class EntryScrollCache {
  // Insertion-ordered Map: oldest entry is Map.keys().next()
  private map = new Map<string, number>()

  constructor() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Array<[string, number]>
        if (Array.isArray(parsed)) {
          for (const [k, v] of parsed) {
            if (typeof k === 'string' && typeof v === 'number') {
              this.map.set(k, v)
            }
          }
        }
      }
    } catch {
      // ignore parse / storage errors
    }
  }

  get(entryId: string): number | undefined {
    return this.map.get(entryId)
  }

  set(entryId: string, value: number): void {
    // Refresh position in insertion order
    this.map.delete(entryId)
    this.map.set(entryId, value)
    // Evict oldest entries beyond the cap
    while (this.map.size > POSITION_CACHE_SIZE) {
      const oldest = this.map.keys().next().value
      if (oldest !== undefined) this.map.delete(oldest)
    }
    this.persist()
  }

  private persist(): void {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(Array.from(this.map.entries())))
    } catch {
      // ignore storage errors (private browsing, quota exceeded, etc.)
    }
  }
}

const entryScrollPositions = new EntryScrollCache()

/** Returns the saved scroll position for an entry, or undefined if none. */
export function getEntryScrollPosition(entryId: string): number | undefined {
  return entryScrollPositions.get(entryId)
}

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
