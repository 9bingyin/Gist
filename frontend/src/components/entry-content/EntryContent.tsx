import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useEntry, useMarkAsRead, useMarkAsStarred } from '@/hooks/useEntries'
import { useEntryContentScroll } from '@/hooks/useEntryContentScroll'
import {
  fetchReadableContent,
  streamSummary,
  streamTranslateBlocks,
  isTranslateInit,
  isTranslateBlockResult,
  isTranslateDone,
  isTranslateError,
  type TranslateBlockData,
} from '@/api'
import { EntryContentHeader } from './EntryContentHeader'
import { EntryContentBody } from './EntryContentBody'

interface EntryContentProps {
  entryId: string | null
}

export function EntryContent({ entryId }: EntryContentProps) {
  const { data: entry, isLoading } = useEntry(entryId)
  const { mutate: markAsRead } = useMarkAsRead()
  const { mutate: markAsStarred } = useMarkAsStarred()
  const { scrollRef, isAtTop } = useEntryContentScroll(entryId)

  const [isReadableLoading, setIsReadableLoading] = useState(false)
  const [localReadableContent, setLocalReadableContent] = useState<string | null>(null)
  const [showReadable, setShowReadable] = useState(false)
  const [readableError, setReadableError] = useState<string | null>(null)

  // AI Summary state
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [isLoadingSummary, setIsLoadingSummary] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const summaryAbortRef = useRef<AbortController | null>(null)
  const summaryRequestedRef = useRef(false)
  const prevReadableActiveRef = useRef(false)

  // AI Translation state
  const [translatedContent, setTranslatedContent] = useState<string | null>(null)
  const [originalBlocks, setOriginalBlocks] = useState<TranslateBlockData[]>([])
  const [translatedBlocks, setTranslatedBlocks] = useState<Map<number, string>>(new Map())
  const [isTranslating, setIsTranslating] = useState(false)
  const [_translationError, setTranslationError] = useState<string | null>(null)
  const translateAbortRef = useRef<AbortController | null>(null)
  const translateRequestedRef = useRef(false)
  const prevTranslateReadableRef = useRef(false)

  useEffect(() => {
    if (entry && !entry.read) {
      markAsRead({ id: entry.id, read: true })
    }
  }, [entry, markAsRead])

  // Reset AI summary and translation when entry changes
  useEffect(() => {
    setAiSummary(null)
    setSummaryError(null)
    setIsLoadingSummary(false)
    // Cancel any ongoing summary request
    if (summaryAbortRef.current) {
      summaryAbortRef.current.abort()
      summaryAbortRef.current = null
    }
    // Reset tracking refs
    summaryRequestedRef.current = false
    prevReadableActiveRef.current = false

    // Reset translation state
    setTranslatedContent(null)
    setOriginalBlocks([])
    setTranslatedBlocks(new Map())
    setTranslationError(null)
    setIsTranslating(false)
    if (translateAbortRef.current) {
      translateAbortRef.current.abort()
      translateAbortRef.current = null
    }
    translateRequestedRef.current = false
    prevTranslateReadableRef.current = false
  }, [entryId])

  const readableContent = localReadableContent || entry?.readableContent
  const hasReadableContent = !!readableContent

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

  const baseContent = hasReadableContent && showReadable ? readableContent : entry?.content
  const isReadableActive = hasReadableContent && showReadable

  const handleToggleStarred = useCallback(() => {
    if (entry) {
      markAsStarred({ id: entry.id, starred: !entry.starred })
    }
  }, [entry, markAsStarred])

  // Core function to generate summary
  const generateSummary = useCallback(async (forReadability: boolean) => {
    if (!entry) return

    // Cancel any ongoing request first
    if (summaryAbortRef.current) {
      summaryAbortRef.current.abort()
    }

    // Get the content to summarize
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
          // Cached response
          setAiSummary(chunk.summary)
        } else {
          // Streaming response
          setAiSummary(prev => (prev ?? '') + chunk)
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Request was cancelled, don't update state (new request will handle it)
        return
      }
      const message = err instanceof Error ? err.message : 'Failed to generate summary'
      setSummaryError(message)
      setIsLoadingSummary(false)
      summaryAbortRef.current = null
      return
    }

    // Only update state if this request wasn't aborted
    setIsLoadingSummary(false)
    summaryAbortRef.current = null
  }, [entry, readableContent])

  const handleToggleSummary = useCallback(async () => {
    if (!entry) return

    // If already showing summary, hide it
    if (aiSummary && !isLoadingSummary) {
      setAiSummary(null)
      summaryRequestedRef.current = false
      return
    }

    // If loading, cancel the request
    if (isLoadingSummary && summaryAbortRef.current) {
      summaryAbortRef.current.abort()
      summaryAbortRef.current = null
      setIsLoadingSummary(false)
      summaryRequestedRef.current = false
      return
    }

    await generateSummary(isReadableActive)
  }, [entry, aiSummary, isLoadingSummary, isReadableActive, generateSummary])

  // Auto-regenerate summary when readability mode changes
  useEffect(() => {
    if (prevReadableActiveRef.current !== isReadableActive) {
      prevReadableActiveRef.current = isReadableActive
      // If user had requested a summary, regenerate for new mode
      if (summaryRequestedRef.current && (aiSummary || isLoadingSummary)) {
        generateSummary(isReadableActive)
      }
    }
  }, [isReadableActive, aiSummary, isLoadingSummary, generateSummary])

  // Core function to generate translation
  const generateTranslation = useCallback(async (forReadability: boolean) => {
    if (!entry) return

    // Cancel any ongoing request first
    if (translateAbortRef.current) {
      translateAbortRef.current.abort()
    }

    // Get the content to translate
    const content = forReadability ? readableContent : entry.content
    if (!content) {
      setTranslationError('No content to translate')
      return
    }

    setIsTranslating(true)
    setTranslationError(null)
    setTranslatedContent(null)
    setOriginalBlocks([])
    setTranslatedBlocks(new Map())
    translateRequestedRef.current = true

    const abortController = new AbortController()
    translateAbortRef.current = abortController

    try {
      const stream = streamTranslateBlocks(
        {
          entryId: entry.id,
          content,
          title: entry.title ?? undefined,
          isReadability: forReadability,
        },
        abortController.signal
      )

      for await (const event of stream) {
        // Cached response
        if ('cached' in event) {
          setTranslatedContent(event.content)
          break
        }

        // SSE events
        const sseEvent = event

        // Init event with all original blocks
        if (isTranslateInit(sseEvent)) {
          setOriginalBlocks(sseEvent.blocks)
          continue
        }

        // Block result (translated)
        if (isTranslateBlockResult(sseEvent)) {
          setTranslatedBlocks(prev => {
            const newMap = new Map(prev)
            newMap.set(sseEvent.index, sseEvent.html)
            return newMap
          })
        }

        // Done event
        if (isTranslateDone(sseEvent)) {
          // Translation complete
        }

        // Error event
        if (isTranslateError(sseEvent)) {
          setTranslationError(sseEvent.error)
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Request was cancelled, don't update state
        return
      }
      const message = err instanceof Error ? err.message : 'Failed to translate'
      setTranslationError(message)
      setIsTranslating(false)
      translateAbortRef.current = null
      return
    }

    setIsTranslating(false)
    translateAbortRef.current = null
  }, [entry, readableContent])

  const handleToggleTranslation = useCallback(async () => {
    if (!entry) return

    // If already showing translation (either full content or blocks), hide it
    const hasTranslation = translatedContent || originalBlocks.length > 0
    if (hasTranslation && !isTranslating) {
      setTranslatedContent(null)
      setOriginalBlocks([])
      setTranslatedBlocks(new Map())
      translateRequestedRef.current = false
      return
    }

    // If translating, cancel the request
    if (isTranslating && translateAbortRef.current) {
      translateAbortRef.current.abort()
      translateAbortRef.current = null
      setIsTranslating(false)
      setOriginalBlocks([])
      setTranslatedBlocks(new Map())
      translateRequestedRef.current = false
      return
    }

    await generateTranslation(isReadableActive)
  }, [entry, translatedContent, originalBlocks.length, isTranslating, isReadableActive, generateTranslation])

  // Auto-regenerate translation when readability mode changes
  useEffect(() => {
    if (prevTranslateReadableRef.current !== isReadableActive) {
      prevTranslateReadableRef.current = isReadableActive
      // If user had requested a translation, regenerate for new mode
      const hasTranslation = translatedContent || originalBlocks.length > 0
      if (translateRequestedRef.current && (hasTranslation || isTranslating)) {
        generateTranslation(isReadableActive)
      }
    }
  }, [isReadableActive, translatedContent, originalBlocks.length, isTranslating, generateTranslation])

  // Combine blocks into display content
  // Use translated content if cached, otherwise combine original + translated blocks
  const combinedTranslatedContent = useMemo(() => {
    if (translatedContent) {
      return translatedContent // Cached full content
    }
    if (originalBlocks.length === 0) {
      return null
    }
    // Combine blocks: use translated version if available, otherwise original
    return originalBlocks
      .map(block => translatedBlocks.get(block.index) ?? block.html)
      .join('')
  }, [translatedContent, originalBlocks, translatedBlocks])

  if (entryId === null) {
    return <EntryContentEmpty />
  }

  if (isLoading) {
    return <EntryContentSkeleton />
  }

  if (!entry) {
    return <EntryContentEmpty />
  }

  return (
    <div className="relative flex h-full flex-col">
      <EntryContentHeader
        entry={entry}
        isAtTop={isAtTop}
        isReadableActive={isReadableActive}
        isLoading={isReadableLoading}
        error={readableError}
        onToggleReadable={handleToggleReadable}
        onToggleStarred={handleToggleStarred}
        isLoadingSummary={isLoadingSummary}
        hasSummary={!!aiSummary}
        onToggleSummary={handleToggleSummary}
        isTranslating={isTranslating}
        hasTranslation={!!(translatedContent || originalBlocks.length > 0)}
        onToggleTranslation={handleToggleTranslation}
      />
      <EntryContentBody
        entry={entry}
        scrollRef={scrollRef}
        displayContent={combinedTranslatedContent ?? baseContent}
        aiSummary={aiSummary}
        isLoadingSummary={isLoadingSummary}
        summaryError={summaryError}
      />
    </div>
  )
}

function EntryContentEmpty() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 items-center px-6" />
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center text-muted-foreground">
          <svg
            className="mx-auto size-12 opacity-50"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p className="mt-2 text-sm">Select an article to read</p>
        </div>
      </div>
    </div>
  )
}

function EntryContentSkeleton() {
  return (
    <div className="relative flex h-full flex-col animate-pulse">
      {/* Empty header placeholder - matches EntryContentHeader height when isAtTop=true */}
      <div className="absolute inset-x-0 top-0 z-20">
        <div className="h-12" />
      </div>
      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-[720px] px-6 pb-20 pt-16">
          <div className="mb-10 space-y-5">
            <div className="h-10 w-3/4 rounded bg-muted" />
            <div className="flex gap-6">
              <div className="h-4 w-24 rounded bg-muted" />
              <div className="h-4 w-32 rounded bg-muted" />
            </div>
            <hr className="border-border/60" />
          </div>
          <div className="space-y-4">
            <div className="h-4 w-full rounded bg-muted" />
            <div className="h-4 w-full rounded bg-muted" />
            <div className="h-4 w-3/4 rounded bg-muted" />
            <div className="h-4 w-full rounded bg-muted" />
            <div className="h-4 w-5/6 rounded bg-muted" />
          </div>
        </div>
      </div>
    </div>
  )
}
