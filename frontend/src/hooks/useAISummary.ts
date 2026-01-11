import { useState, useCallback, useEffect, useRef } from 'react'
import { streamSummary } from '@/api'
import type { Entry } from '@/types/api'

interface UseAISummaryOptions {
  entry: Entry | undefined
  isReadableActive: boolean
  readableContent: string | null | undefined
  autoSummary: boolean
}

interface UseAISummaryReturn {
  aiSummary: string | null
  isLoadingSummary: boolean
  summaryError: string | null
  handleToggleSummary: () => Promise<void>
}

export function useAISummary({
  entry,
  isReadableActive,
  readableContent,
  autoSummary,
}: UseAISummaryOptions): UseAISummaryReturn {
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [isLoadingSummary, setIsLoadingSummary] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)

  const summaryAbortRef = useRef<AbortController | null>(null)
  const summaryRequestedRef = useRef(false)
  const prevReadableActiveRef = useRef(false)
  const summaryManuallyDisabledRef = useRef(false)

  // Reset state when entry changes
  useEffect(() => {
    setAiSummary(null)
    setSummaryError(null)
    setIsLoadingSummary(false)
    if (summaryAbortRef.current) {
      summaryAbortRef.current.abort()
      summaryAbortRef.current = null
    }
    summaryRequestedRef.current = false
    prevReadableActiveRef.current = false
    summaryManuallyDisabledRef.current = false
  }, [entry?.id])

  const generateSummary = useCallback(async (forReadability: boolean) => {
    if (!entry) return

    if (summaryAbortRef.current) {
      summaryAbortRef.current.abort()
    }

    const content = forReadability ? readableContent : entry.content
    if (!content) {
      setSummaryError('No content to summarize')
      return
    }

    setIsLoadingSummary(true)
    setSummaryError(null)
    setAiSummary(null)
    summaryRequestedRef.current = true

    const abortController = new AbortController()
    summaryAbortRef.current = abortController

    try {
      const stream = streamSummary(
        {
          entryId: entry.id,
          content,
          title: entry.title ?? undefined,
          isReadability: forReadability,
        },
        abortController.signal
      )

      for await (const chunk of stream) {
        if (typeof chunk === 'object' && 'cached' in chunk) {
          setAiSummary(chunk.summary)
        } else {
          setAiSummary(prev => (prev ?? '') + chunk)
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return
      }
      const message = err instanceof Error ? err.message : 'Failed to generate summary'
      setSummaryError(message)
      setIsLoadingSummary(false)
      summaryAbortRef.current = null
      return
    }

    setIsLoadingSummary(false)
    summaryAbortRef.current = null
  }, [entry, readableContent])

  const handleToggleSummary = useCallback(async () => {
    if (!entry) return

    if (aiSummary && !isLoadingSummary) {
      setAiSummary(null)
      summaryRequestedRef.current = false
      summaryManuallyDisabledRef.current = true
      return
    }

    if (isLoadingSummary && summaryAbortRef.current) {
      summaryAbortRef.current.abort()
      summaryAbortRef.current = null
      setIsLoadingSummary(false)
      summaryRequestedRef.current = false
      summaryManuallyDisabledRef.current = true
      return
    }

    summaryManuallyDisabledRef.current = false
    await generateSummary(isReadableActive)
  }, [entry, aiSummary, isLoadingSummary, isReadableActive, generateSummary])

  // Auto-regenerate when readability mode changes
  useEffect(() => {
    if (prevReadableActiveRef.current !== isReadableActive) {
      prevReadableActiveRef.current = isReadableActive
      if (summaryRequestedRef.current && (aiSummary || isLoadingSummary)) {
        generateSummary(isReadableActive)
      }
    }
  }, [isReadableActive, aiSummary, isLoadingSummary, generateSummary])

  // Auto-generate when entry is selected
  useEffect(() => {
    if (!autoSummary || !entry || isLoadingSummary) return
    if (summaryManuallyDisabledRef.current) return
    if (aiSummary || summaryRequestedRef.current) return

    generateSummary(isReadableActive)
  }, [autoSummary, entry, isReadableActive, isLoadingSummary, aiSummary, generateSummary])

  return {
    aiSummary,
    isLoadingSummary,
    summaryError,
    handleToggleSummary,
  }
}
