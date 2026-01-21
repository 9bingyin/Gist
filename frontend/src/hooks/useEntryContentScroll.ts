import { useCallback, useLayoutEffect, useRef, useState } from 'react'

const SCROLL_TOP_THRESHOLD = 48

export function useEntryContentScroll(entryId: string | null) {
  const [scrollNode, setScrollNode] = useState<HTMLDivElement | null>(null)
  const [isAtTop, setIsAtTop] = useState(true)
  const processedEntryIdRef = useRef<string | null>(null)

  // Callback ref - triggers when DOM node is attached/detached
  const scrollRef = useCallback((node: HTMLDivElement | null) => {
    setScrollNode(node)
  }, [])

  useLayoutEffect(() => {
    // Mark this entryId as processed
    processedEntryIdRef.current = entryId

    if (!scrollNode) return

    const handleScroll = () => {
      const atTop = scrollNode.scrollTop < SCROLL_TOP_THRESHOLD
      setIsAtTop(atTop)
    }

    // Reset scroll and state
    // eslint-disable-next-line react-hooks/immutability
    scrollNode.scrollTop = 0
    setIsAtTop(true)

    scrollNode.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      scrollNode.removeEventListener('scroll', handleScroll)
    }
  }, [entryId, scrollNode])

  // If entryId hasn't been processed by effect yet, force return true
  // This prevents flash when switching articles (old isAtTop value being used)
  const effectiveIsAtTop = processedEntryIdRef.current !== entryId ? true : isAtTop

  return { scrollRef, isAtTop: effectiveIsAtTop, scrollNode }
}
