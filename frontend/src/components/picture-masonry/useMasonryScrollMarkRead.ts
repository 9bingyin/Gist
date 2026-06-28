import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMarkManyAsRead, useRemoveFromUnreadList } from '@/hooks/useEntries'
import type { Entry } from '@/types/api'

const MARK_READ_ON_SCROLL_BATCH_DELAY_MS = 200
const MARK_READ_ON_SCROLL_GRACE_MS = 1000

interface UseMasonryScrollMarkReadOptions {
  scrollElement: HTMLElement | null
  entries: Entry[]
  enabled: boolean
  unreadOnly: boolean
  hasNextPage: boolean
  resetKey: string
}

interface UseMasonryScrollMarkReadResult {
  endPaddingHeight: number
}

interface AnchorSnapshot {
  id: string
  top: number
}

function findVisibleAnchor(root: HTMLElement, excludingIds: Set<string>): AnchorSnapshot | null {
  const rootRect = root.getBoundingClientRect()
  let anchor: AnchorSnapshot | null = null

  for (const item of root.querySelectorAll<HTMLElement>('[data-entry-id]')) {
    const entryId = item.dataset.entryId
    if (!entryId || excludingIds.has(entryId)) continue

    const rect = item.getBoundingClientRect()
    if (rect.bottom <= rootRect.top || rect.top >= rootRect.bottom) continue
    if (!anchor || rect.top < anchor.top) {
      anchor = { id: entryId, top: rect.top }
    }
  }

  return anchor
}

function findEntryElement(root: HTMLElement, entryId: string): HTMLElement | null {
  for (const item of root.querySelectorAll<HTMLElement>('[data-entry-id]')) {
    if (item.dataset.entryId === entryId) return item
  }
  return null
}

export function useMasonryScrollMarkRead({
  scrollElement,
  entries,
  enabled,
  unreadOnly,
  hasNextPage,
  resetKey,
}: UseMasonryScrollMarkReadOptions): UseMasonryScrollMarkReadResult {
  const { mutate: markManyAsRead } = useMarkManyAsRead()
  const removeFromUnreadList = useRemoveFromUnreadList()
  const seenEntryIds = useRef(new Set<string>())
  const markedReadIds = useRef(new Set<string>())
  const pendingReadEntryIds = useRef(new Set<string>())
  const batchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const graceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const session = useRef(0)
  const graceUntil = useRef(0)
  const [observerVersion, setObserverVersion] = useState(0)
  const endPaddingHeightRef = useRef(0)
  const [scrollLayout, setScrollLayout] = useState({
    viewportHeight: 0,
    naturalContentOverflows: false,
  })
  const scrollElementRef = useRef<HTMLElement | null>(scrollElement)

  const entriesIdentityKey = useMemo(() => entries.map((entry) => entry.id).join('\u0000'), [entries])
  const hasUnreadEntries = useMemo(() => entries.some((entry) => !entry.read), [entries])
  const endPaddingHeight =
    enabled && hasUnreadEntries && !hasNextPage && scrollLayout.naturalContentOverflows
      ? scrollLayout.viewportHeight
      : 0

  useEffect(() => {
    scrollElementRef.current = scrollElement
  }, [scrollElement])
  useEffect(() => {
    endPaddingHeightRef.current = endPaddingHeight
  }, [endPaddingHeight])

  const measureScrollLayout = useCallback(() => {
    if (!scrollElement) return

    const viewportHeight = scrollElement.clientHeight
    const naturalScrollHeight = Math.max(0, scrollElement.scrollHeight - endPaddingHeightRef.current)
    const naturalContentOverflows = naturalScrollHeight > viewportHeight + 1

    setScrollLayout((current) => {
      if (
        current.viewportHeight === viewportHeight &&
        current.naturalContentOverflows === naturalContentOverflows
      ) {
        return current
      }

      return { viewportHeight, naturalContentOverflows }
    })
  }, [scrollElement])

  useEffect(() => {
    if (!scrollElement) return

    measureScrollLayout()

    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(measureScrollLayout)
    observer.observe(scrollElement)
    for (const child of Array.from(scrollElement.children)) {
      observer.observe(child)
    }

    return () => {
      observer.disconnect()
    }
  }, [measureScrollLayout, scrollElement])

  useEffect(() => {
    measureScrollLayout()
  }, [entriesIdentityKey, enabled, hasNextPage, measureScrollLayout])

  useEffect(() => {
    seenEntryIds.current.clear()
    markedReadIds.current.clear()
    pendingReadEntryIds.current.clear()
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
    seenEntryIds.current.clear()
    markedReadIds.current.clear()
    session.current += 1
  }, [scrollElement])

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

  const flushReadQueue = useCallback(function flushReadQueue() {
    if (batchTimer.current) {
      clearTimeout(batchTimer.current)
      batchTimer.current = null
    }

    const pendingIds = pendingReadEntryIds.current
    if (pendingIds.size === 0) return

    const node = scrollElementRef.current
    if (!node) {
      batchTimer.current = setTimeout(flushReadQueue, MARK_READ_ON_SCROLL_BATCH_DELAY_MS)
      return
    }

    const ids = Array.from(pendingIds)
    pendingIds.clear()

    const idSet = new Set(ids)
    const anchor = findVisibleAnchor(node, idSet)
    const currentSession = session.current

    markManyAsRead(
      { ids, read: true, skipInvalidate: true },
      {
        onSuccess: () => {
          if (!unreadOnly || session.current !== currentSession) return

          removeFromUnreadList(idSet)

          if (!anchor) return
          requestAnimationFrame(() => {
            if (session.current !== currentSession || scrollElementRef.current !== node) return
            const nextAnchor = findEntryElement(node, anchor.id)
            if (!nextAnchor) return

            node.scrollTop += nextAnchor.getBoundingClientRect().top - anchor.top
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
  }, [markManyAsRead, removeFromUnreadList, unreadOnly])

  const queueRead = useCallback((entryId: string) => {
    pendingReadEntryIds.current.add(entryId)
    if (batchTimer.current) return

    const remainingGraceMs = Math.max(0, graceUntil.current - Date.now())
    batchTimer.current = setTimeout(
      flushReadQueue,
      remainingGraceMs + MARK_READ_ON_SCROLL_BATCH_DELAY_MS
    )
  }, [flushReadQueue])

  useEffect(() => {
    if (!enabled || !scrollElement || typeof IntersectionObserver === 'undefined') return

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

          const rootTop = item.rootBounds?.top ?? scrollElement.getBoundingClientRect().top
          if (!seenEntryIds.current.has(entryId) || item.boundingClientRect.bottom > rootTop) {
            continue
          }

          markedReadIds.current.add(entryId)
          queueRead(entryId)
        }
      },
      { root: scrollElement, threshold: 0 }
    )

    const observedItems = new WeakMap<Element, string>()
    const observeEntryItems = () => {
      const rootRect = scrollElement.getBoundingClientRect()
      for (const item of scrollElement.querySelectorAll<HTMLElement>('[data-entry-id]')) {
        const entryId = item.dataset.entryId
        if (!entryId || !unreadIds.has(entryId) || markedReadIds.current.has(entryId)) continue
        if (observedItems.get(item) === entryId) continue

        const itemRect = item.getBoundingClientRect()
        if (itemRect.bottom > rootRect.top && itemRect.top < rootRect.bottom) {
          seenEntryIds.current.add(entryId)
        }

        if (!observedItems.has(item)) {
          observer.observe(item)
        }
        observedItems.set(item, entryId)
      }

    }

    observeEntryItems()

    const mutationObserver = typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver(observeEntryItems)
    mutationObserver?.observe(scrollElement, { childList: true, subtree: true })

    return () => {
      mutationObserver?.disconnect()
      observer.disconnect()
    }
  }, [enabled, entries, observerVersion, queueRead, scrollElement])

  return { endPaddingHeight }
}
