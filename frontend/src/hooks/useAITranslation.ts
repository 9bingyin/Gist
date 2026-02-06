import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import {
  streamTranslateBlocks,
  isTranslateInit,
  isTranslateBlockResult,
  isTranslateDone,
  isTranslateError,
  type TranslateBlockData,
} from '@/api'
import { needsTranslation } from '@/lib/language-detect'
import { stripHtml } from '@/lib/html-utils'
import { useTranslationStore, translationActions } from '@/stores/translation-store'
import { translateArticlesBatch } from '@/services/translation-service'
import type { Entry } from '@/types/api'

interface UseAITranslationOptions {
  entry: Entry | undefined
  isReadableActive: boolean
  readableContent: string | null | undefined
  autoTranslate: boolean
  targetLanguage: string
}

interface UseAITranslationReturn {
  isTranslating: boolean
  hasTranslation: boolean
  translationDisabled: boolean
  displayTitle: string | null
  translatedContent: string | null
  translatedContentBlocks: Array<{ key: string; html: string }> | null
  combinedTranslatedContent: string | null
  handleToggleTranslation: () => Promise<void>
}

export function useAITranslation({
  entry,
  isReadableActive,
  readableContent,
  autoTranslate,
  targetLanguage,
}: UseAITranslationOptions): UseAITranslationReturn {
  const [translatedContent, setTranslatedContent] = useState<string | null>(null)
  const [originalBlocks, setOriginalBlocks] = useState<TranslateBlockData[]>([])
  const [translatedBlocks, setTranslatedBlocks] = useState<Map<number, string>>(new Map())
  const [isTranslating, setIsTranslating] = useState(false)
  const [translationMode, setTranslationMode] = useState<boolean | null>(null)

  const translateAbortRef = useRef<AbortController | null>(null)
  const translateRequestedRef = useRef(false)
  const prevTranslateReadableRef = useRef(false)
  const manuallyDisabledRef = useRef(false)
  const requestSeqRef = useRef(0)
  const hasExistingTranslationRef = useRef(false)
  const isTranslatingRef = useRef(false)

  const clearTranslationState = useCallback(() => {
    setTranslatedContent(null)
    setOriginalBlocks([])
    setTranslatedBlocks(new Map())
    setTranslationMode(null)
    hasExistingTranslationRef.current = false
  }, [])

  const cancelInFlightTranslation = useCallback(() => {
    requestSeqRef.current += 1
    if (translateAbortRef.current) {
      translateAbortRef.current.abort()
      translateAbortRef.current = null
    }
    setIsTranslating(false)
    isTranslatingRef.current = false
  }, [])

  // Reset state when entry changes
  useEffect(() => {
    cancelInFlightTranslation()
    clearTranslationState()
    translateRequestedRef.current = false
    prevTranslateReadableRef.current = false
    manuallyDisabledRef.current = false
  }, [entry?.id, cancelInFlightTranslation, clearTranslationState])

  // Get cached translations from store
  const cachedTranslation = useTranslationStore((state) =>
    entry && autoTranslate
      ? state.getTranslation(entry.id, targetLanguage, isReadableActive)
      : undefined
  )

  const cachedTitleTranslation = useTranslationStore((state) =>
    entry && autoTranslate
      ? state.getTranslation(entry.id, targetLanguage)
      : undefined
  )

  const isTranslationForCurrentMode = translationMode === isReadableActive
  const translatedContentForCurrentMode = isTranslationForCurrentMode ? translatedContent : null

  const isAlreadyTargetLanguage = useMemo(() => {
    if (!entry) return false
    const content = isReadableActive ? readableContent : entry.content
    const summary = content ? stripHtml(content).slice(0, 200) : null
    return !needsTranslation(entry.title || '', summary, targetLanguage)
  }, [entry, isReadableActive, readableContent, targetLanguage])

  const displayTitle = useMemo(() => {
    if (!autoTranslate || !entry) return entry?.title || null
    return cachedTitleTranslation?.title ?? entry.title ?? null
  }, [autoTranslate, entry, cachedTitleTranslation?.title])

  const combinedTranslatedContent = useMemo(() => {
    if (!isTranslationForCurrentMode) return null
    if (translatedContentForCurrentMode) return translatedContentForCurrentMode
    if (originalBlocks.length === 0) return null
    return originalBlocks
      .map(block => translatedBlocks.get(block.index) ?? block.html)
      .join('')
  }, [isTranslationForCurrentMode, translatedContentForCurrentMode, originalBlocks, translatedBlocks])

  const translatedContentBlocks = useMemo(() => {
    if (!entry || !isTranslationForCurrentMode || translatedContentForCurrentMode || originalBlocks.length === 0) {
      return null
    }
    return originalBlocks.map((block) => ({
      key: `${entry.id}-${block.index}`,
      html: translatedBlocks.get(block.index) ?? block.html,
    }))
  }, [entry, isTranslationForCurrentMode, translatedContentForCurrentMode, originalBlocks, translatedBlocks])

  const hasTranslation = !isTranslating && isTranslationForCurrentMode && !!(translatedContentForCurrentMode || originalBlocks.length > 0)

  const generateTranslation = useCallback(async (forReadability: boolean) => {
    if (!entry) return

    const content = forReadability ? readableContent : entry.content
    if (!content) return

    requestSeqRef.current += 1
    if (translateAbortRef.current) {
      translateAbortRef.current.abort()
      translateAbortRef.current = null
    }
    const requestSeq = requestSeqRef.current

    setIsTranslating(true)
    isTranslatingRef.current = true
    setTranslatedContent(null)
    setOriginalBlocks([])
    setTranslatedBlocks(new Map())
    hasExistingTranslationRef.current = false
    setTranslationMode(forReadability)
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
        if (requestSeqRef.current !== requestSeq) {
          return
        }

        if ('cached' in event) {
          setTranslatedContent(event.content)
          setOriginalBlocks([])
          setTranslatedBlocks(new Map())
          break
        }

        if (isTranslateInit(event)) {
          setOriginalBlocks(event.blocks)
          continue
        }

        if (isTranslateBlockResult(event)) {
          setTranslatedBlocks(prev => {
            const newMap = new Map(prev)
            newMap.set(event.index, event.html)
            return newMap
          })
        }

        if (isTranslateDone(event)) {
          // Translation complete
        }

        if (isTranslateError(event)) {
          // Handle error
        }
      }
    } catch (err) {
      if (requestSeqRef.current !== requestSeq) {
        return
      }
      if (err instanceof Error && err.name === 'AbortError') {
        return
      }
      return
    } finally {
      if (requestSeqRef.current === requestSeq) {
        setIsTranslating(false)
        isTranslatingRef.current = false
        if (translateAbortRef.current === abortController) {
          translateAbortRef.current = null
        }
      }
    }
  }, [entry, readableContent])

  useEffect(() => {
    hasExistingTranslationRef.current = !!(translatedContent || originalBlocks.length > 0)
  }, [translatedContent, originalBlocks.length])

  useEffect(() => {
    isTranslatingRef.current = isTranslating
  }, [isTranslating])

  const handleToggleTranslation = useCallback(async () => {
    if (!entry) return

    if (hasTranslation && !isTranslating) {
      clearTranslationState()
      translateRequestedRef.current = false
      manuallyDisabledRef.current = true
      translationActions.disable(entry.id)
      return
    }

    if (isTranslating && translateAbortRef.current) {
      cancelInFlightTranslation()
      clearTranslationState()
      translateRequestedRef.current = false
      manuallyDisabledRef.current = true
      translationActions.disable(entry.id)
      return
    }

    manuallyDisabledRef.current = false
    translationActions.enable(entry.id)

    const summary = entry.content ? stripHtml(entry.content).slice(0, 200) : null
    if (needsTranslation(entry.title || '', summary, targetLanguage)) {
      translateArticlesBatch(
        [{ id: entry.id, title: entry.title || '', summary }],
        targetLanguage
      ).catch(() => {})
    }

    await generateTranslation(isReadableActive)
  }, [entry, hasTranslation, isTranslating, isReadableActive, clearTranslationState, cancelInFlightTranslation, generateTranslation, targetLanguage])

  // Auto-regenerate when readability mode changes
  useEffect(() => {
    if (prevTranslateReadableRef.current !== isReadableActive) {
      prevTranslateReadableRef.current = isReadableActive
      if (translateRequestedRef.current && (hasExistingTranslationRef.current || isTranslatingRef.current)) {
        if (cachedTranslation?.content) {
          cancelInFlightTranslation()
          clearTranslationState()
          setTranslatedContent(cachedTranslation.content)
          setTranslationMode(isReadableActive)
          translateRequestedRef.current = true
          return
        }

        const content = isReadableActive ? readableContent : entry?.content
        const summary = content ? stripHtml(content).slice(0, 200) : null

        if (needsTranslation(entry?.title || '', summary, targetLanguage)) {
          generateTranslation(isReadableActive)
        } else {
          cancelInFlightTranslation()
          clearTranslationState()
          translateRequestedRef.current = false
        }
      }
    }
  }, [
    isReadableActive,
    cancelInFlightTranslation,
    clearTranslationState,
    generateTranslation,
    readableContent,
    entry,
    targetLanguage,
    cachedTranslation,
  ])

  // Auto-translate when entry is selected
  useEffect(() => {
    if (!autoTranslate || !entry || isTranslating || isTranslatingRef.current) return
    if (manuallyDisabledRef.current) return
    if (hasTranslation) return

    if (cachedTranslation?.content) {
      setTranslatedContent(cachedTranslation.content)
      setTranslationMode(isReadableActive)
      translateRequestedRef.current = true
      return
    }

    const content = isReadableActive ? readableContent : entry.content
    const summary = content ? stripHtml(content).slice(0, 200) : null
    if (!needsTranslation(entry.title || '', summary, targetLanguage)) {
      return
    }

    generateTranslation(isReadableActive)
  }, [
    autoTranslate,
    entry,
    isReadableActive,
    readableContent,
    targetLanguage,
    cachedTranslation,
    isTranslating,
    hasTranslation,
    generateTranslation,
  ])

  // Save translation to store when completed
  useEffect(() => {
    if (!entry || !autoTranslate) return

    const content = combinedTranslatedContent
    if (content && !isTranslating && translationMode !== null) {
      translationActions.set(entry.id, targetLanguage, { content }, translationMode)
    }
  }, [entry, autoTranslate, targetLanguage, translationMode, combinedTranslatedContent, isTranslating])

  return {
    isTranslating,
    hasTranslation,
    translationDisabled: isAlreadyTargetLanguage,
    displayTitle,
    translatedContent: translatedContentForCurrentMode,
    translatedContentBlocks,
    combinedTranslatedContent,
    handleToggleTranslation,
  }
}
