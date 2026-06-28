import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useMarkManyAsRead, useRemoveFromUnreadList } from '@/hooks/useEntries'
import type { Entry } from '@/types/api'

const MARK_READ_ON_SCROLL_BATCH_DELAY_MS = 200
const MARK_READ_ON_SCROLL_GRACE_MS = 1000

interface UseScrollMarkReadOptions {
  containerRef: RefObject<HTMLDivElement | null>
  entries: Entry[]
  enabled: boolean
  unreadOnly: boolean
  hasNextPage: boolean
  resetKey: string
}

interface UseScrollMarkReadResult {
  endPaddingHeight: number
}

export function useScrollMarkRead({
  containerRef,
  entries,
  enabled,
  unreadOnly,
  hasNextPage,
  resetKey,
}: UseScrollMarkReadOptions): UseScrollMarkReadResult {
  const { mutate: markManyAsRead } = useMarkManyAsRead()
  const removeFromUnreadList = useRemoveFromUnreadList()
  const seenEntryIds = useRef(new Set<string>())
  const markedReadIds = useRef(new Set<string>())
  const pendingReadEntries = useRef(new Map<string, number>())
  const batchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const graceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const session = useRef(0)
  const graceUntil = useRef(0)
  const [observerVersion, setObserverVersion] = useState(0)
  const endPaddingHeightRef = useRef(0)
  const [scrollLayout, setScrollLayout] = useState({
    containerHeight: 0,
    naturalContentOverflows: false,
  })

  const entriesIdentityKey = useMemo(() => entries.map((entry) => entry.id).join('\u0000'), [entries])
  const hasUnreadEntries = useMemo(() => entries.some((entry) => !entry.read), [entries])
  const endPaddingHeight =
    enabled && hasUnreadEntries && !hasNextPage && scrollLayout.naturalContentOverflows
      ? scrollLayout.containerHeight
      : 0

  useEffect(() => {
    endPaddingHeightRef.current = endPaddingHeight
  }, [endPaddingHeight])

  const measureScrollLayout = useCallback(() => {
    const node = containerRef.current
    if (!node) return

    const containerHeight = node.clientHeight
    const naturalScrollHeight = Math.max(0, node.scrollHeight - endPaddingHeightRef.current)
    const naturalContentOverflows = naturalScrollHeight > containerHeight + 1

    setScrollLayout((current) => {
      if (
        current.containerHeight === containerHeight &&
        current.naturalContentOverflows === naturalContentOverflows
      ) {
        return current
      }

      return { containerHeight, naturalContentOverflows }
    })
  }, [containerRef])

  useEffect(() => {
    const node = containerRef.current
    if (!node) return

    measureScrollLayout()

    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(measureScrollLayout)
    observer.observe(node)
    for (const child of Array.from(node.children)) {
      observer.observe(child)
    }

    return () => {
      observer.disconnect()
    }
  }, [containerRef, measureScrollLayout])

  useEffect(() => {
    measureScrollLayout()
  }, [entriesIdentityKey, enabled, hasNextPage, measureScrollLayout])

  useEffect(() => {
    seenEntryIds.current.clear()
    markedReadIds.current.clear()
    pendingReadEntries.current.clear()
    session.current += 1

    if (batchTimer.current) {
      clearTimeout(batchTimer.current)
      batchTimer.current = null
    }
    if (graceTimer.current) {
      clearTimeout(graceTimer.current)
      graceTimer.current = null
    }
  }, [resetKey])

  useEffect(() => {
    return () => {
      if (batchTimer.current) {
        clearTimeout(batchTimer.current)
        batchTimer.current = null
      }
      if (graceTimer.current) {
        clearTimeout(graceTimer.current)
        graceTimer.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!enabled) return

    seenEntryIds.current.clear()
    graceUntil.current = Date.now() + MARK_READ_ON_SCROLL_GRACE_MS
    if (graceTimer.current) {
      clearTimeout(graceTimer.current)
    }
    graceTimer.current = setTimeout(() => {
      graceTimer.current = null
      setObserverVersion((version) => version + 1)
    }, MARK_READ_ON_SCROLL_GRACE_MS)

    return () => {
      if (graceTimer.current) {
        clearTimeout(graceTimer.current)
        graceTimer.current = null
      }
    }
  }, [entriesIdentityKey, enabled])

  const flushReadQueue = useCallback(() => {
    if (batchTimer.current) {
      clearTimeout(batchTimer.current)
      batchTimer.current = null
    }

    const pendingEntries = pendingReadEntries.current
    if (pendingEntries.size === 0) return

    const node = containerRef.current
    const ids = Array.from(pendingEntries.keys())
    const removedHeight = Array.from(pendingEntries.values()).reduce((sum, height) => sum + height, 0)
    const currentSession = session.current
    pendingEntries.clear()

    markManyAsRead(
      { ids, read: true, skipInvalidate: true },
      {
        onSuccess: () => {
          if (!unreadOnly || session.current !== currentSession) return

          removeFromUnreadList(new Set(ids))

          if (!node || removedHeight <= 0) return
          requestAnimationFrame(() => {
            if (session.current !== currentSession || containerRef.current !== node) return
            node.scrollTop = Math.max(0, node.scrollTop - removedHeight)
          })
        },
        onError: () => {
          for (const id of ids) {
            markedReadIds.current.delete(id)
            seenEntryIds.current.delete(id)
          }
        },
      }
    )
  }, [containerRef, markManyAsRead, removeFromUnreadList, unreadOnly])

  const queueRead = useCallback((entryId: string, removedHeight: number) => {
    if (!pendingReadEntries.current.has(entryId)) {
      pendingReadEntries.current.set(entryId, removedHeight)
    }
    if (batchTimer.current) return

    const remainingGraceMs = Math.max(0, graceUntil.current - Date.now())
    batchTimer.current = setTimeout(
      flushReadQueue,
      remainingGraceMs + MARK_READ_ON_SCROLL_BATCH_DELAY_MS
    )
  }, [flushReadQueue])

  useEffect(() => {
    const node = containerRef.current
    if (!enabled || !node || typeof IntersectionObserver === 'undefined') return

    const unreadIds = new Set(entries.filter((entry) => !entry.read).map((entry) => entry.id))
    if (unreadIds.size === 0) return

    const observer = new IntersectionObserver(
      (items) => {
        for (const item of items) {
          const target = item.target as HTMLElement
          const entryId = target.dataset.entryId
          if (!entryId || !unreadIds.has(entryId) || markedReadIds.current.has(entryId)) continue

          if (item.isIntersecting) {
            seenEntryIds.current.add(entryId)
            continue
          }

          const rootTop = item.rootBounds?.top ?? node.getBoundingClientRect().top
          if (!seenEntryIds.current.has(entryId) || item.boundingClientRect.bottom > rootTop) {
            continue
          }

          markedReadIds.current.add(entryId)
          const removedHeight = target.getBoundingClientRect().height || target.offsetHeight || 0
          queueRead(entryId, removedHeight)
        }
      },
      { root: node, threshold: 0 }
    )

    const rootRect = node.getBoundingClientRect()
    for (const item of node.querySelectorAll<HTMLElement>('[data-entry-id]')) {
      const entryId = item.dataset.entryId
      if (!entryId || !unreadIds.has(entryId) || markedReadIds.current.has(entryId)) continue

      const itemRect = item.getBoundingClientRect()
      if (itemRect.bottom > rootRect.top && itemRect.top < rootRect.bottom) {
        seenEntryIds.current.add(entryId)
      }
      observer.observe(item)
    }

    return () => {
      observer.disconnect()
    }
  }, [containerRef, entries, enabled, observerVersion, queueRead])

  return { endPaddingHeight }
}
