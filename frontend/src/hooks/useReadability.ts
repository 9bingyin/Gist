import { useState, useCallback, useEffect } from 'react'
import { fetchReadableContent } from '@/api'
import type { Entry } from '@/types/api'

interface UseReadabilityOptions {
  entry: Entry | undefined
  autoReadability: boolean
}

interface UseReadabilityReturn {
  isReadableLoading: boolean
  readableContent: string | null | undefined
  showReadable: boolean
  readableError: string | null
  isReadableActive: boolean
  baseContent: string | null | undefined
  handleToggleReadable: () => Promise<void>
}

export function useReadability({
  entry,
  autoReadability,
}: UseReadabilityOptions): UseReadabilityReturn {
  const [isReadableLoading, setIsReadableLoading] = useState(false)
  const [localReadableContent, setLocalReadableContent] = useState<string | null>(null)
  const [showReadable, setShowReadable] = useState(false)
  const [readableError, setReadableError] = useState<string | null>(null)

  // Reset state when entry changes
  useEffect(() => {
    setLocalReadableContent(null)
    setShowReadable(false)
    setReadableError(null)
  }, [entry?.id])

  const readableContent = localReadableContent || entry?.readableContent
  const hasReadableContent = !!readableContent
  const isReadableActive = hasReadableContent && showReadable
  const baseContent = isReadableActive ? readableContent : entry?.content

  const handleToggleReadable = useCallback(async () => {
    if (!entry) return

    if (hasReadableContent) {
      setShowReadable((prev) => !prev)
      return
    }

    if (!entry.url || isReadableLoading) return
    setIsReadableLoading(true)
    setReadableError(null)
    try {
      const content = await fetchReadableContent(entry.id)
      setLocalReadableContent(content)
      setShowReadable(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch readable content'
      setReadableError(message)
    } finally {
      setIsReadableLoading(false)
    }
  }, [entry, hasReadableContent, isReadableLoading])

  // Auto-enable readability when entry is selected
  useEffect(() => {
    if (!autoReadability || !entry || isReadableLoading) return
    if (showReadable) return

    if (entry.readableContent) {
      setShowReadable(true)
      return
    }

    if (entry.url) {
      setIsReadableLoading(true)
      setReadableError(null)
      fetchReadableContent(entry.id)
        .then((content) => {
          setLocalReadableContent(content)
          setShowReadable(true)
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : 'Failed to fetch readable content'
          setReadableError(message)
        })
        .finally(() => {
          setIsReadableLoading(false)
        })
    }
  }, [autoReadability, entry, isReadableLoading, showReadable])

  return {
    isReadableLoading,
    readableContent,
    showReadable,
    readableError,
    isReadableActive,
    baseContent,
    handleToggleReadable,
  }
}
