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

  // Reset state when entry changes
  useEffect(() => {
    setTranslatedContent(null)
    setOriginalBlocks([])
    setTranslatedBlocks(new Map())
    setIsTranslating(false)
    setTranslationMode(null)
    if (translateAbortRef.current) {
      translateAbortRef.current.abort()
      translateAbortRef.current = null
    }
    translateRequestedRef.current = false
    prevTranslateReadableRef.current = false
    manuallyDisabledRef.current = false
  }, [entry?.id])

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
    if (translatedContent) return translatedContent
    if (originalBlocks.length === 0) return null
    return originalBlocks
      .map(block => translatedBlocks.get(block.index) ?? block.html)
      .join('')
  }, [isTranslationForCurrentMode, translatedContent, originalBlocks, translatedBlocks])

  const translatedContentBlocks = useMemo(() => {
    if (!entry || !isTranslationForCurrentMode || translatedContent || originalBlocks.length === 0) {
      return null
    }
    return originalBlocks.map((block) => ({
      key: `${entry.id}-${block.index}`,
      html: translatedBlocks.get(block.index) ?? block.html,
    }))
  }, [entry, isTranslationForCurrentMode, translatedContent, originalBlocks, translatedBlocks])

  const hasTranslation = isTranslationForCurrentMode && !!(translatedContent || originalBlocks.length > 0)

  const generateTranslation = useCallback(async (forReadability: boolean) => {
    if (!entry) return

    if (translateAbortRef.current) {
      translateAbortRef.current.abort()
    }

    const content = forReadability ? readableContent : entry.content
    if (!content) return

    setIsTranslating(true)
    setTranslatedContent(null)
    setOriginalBlocks([])
    setTranslatedBlocks(new Map())
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
        if ('cached' in event) {
          setTranslatedContent(event.content)
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
      if (err instanceof Error && err.name === 'AbortError') {
        return
      }
      setIsTranslating(false)
      translateAbortRef.current = null
      return
    }

    setIsTranslating(false)
    translateAbortRef.current = null
  }, [entry, readableContent])

  const handleToggleTranslation = useCallback(async () => {
    if (!entry) return

    if (hasTranslation && !isTranslating) {
      setTranslatedContent(null)
      setOriginalBlocks([])
      setTranslatedBlocks(new Map())
      setTranslationMode(null)
      translateRequestedRef.current = false
      manuallyDisabledRef.current = true
      translationActions.disable(entry.id)
      return
    }

    if (isTranslating && translateAbortRef.current) {
      translateAbortRef.current.abort()
      translateAbortRef.current = null
      setIsTranslating(false)
      setOriginalBlocks([])
      setTranslatedBlocks(new Map())
      setTranslationMode(null)
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
  }, [entry, hasTranslation, isTranslating, isReadableActive, generateTranslation, targetLanguage])

  // Auto-regenerate when readability mode changes
  useEffect(() => {
    if (prevTranslateReadableRef.current !== isReadableActive) {
      prevTranslateReadableRef.current = isReadableActive
      const hasExistingTranslation = translatedContent || originalBlocks.length > 0
      if (translateRequestedRef.current && (hasExistingTranslation || isTranslating)) {
        if (cachedTranslation?.content) {
          setTranslatedContent(cachedTranslation.content)
          setTranslationMode(isReadableActive)
          return
        }

        const content = isReadableActive ? readableContent : entry?.content
        const summary = content ? stripHtml(content).slice(0, 200) : null
        
        if (needsTranslation(entry?.title || '', summary, targetLanguage)) {
          generateTranslation(isReadableActive)
        } else {
          setTranslatedContent(null)
          setOriginalBlocks([])
          setTranslatedBlocks(new Map())
          setTranslationMode(null)
          translateRequestedRef.current = false
        }
      }
    }
  }, [
    isReadableActive,
    translatedContent,
    originalBlocks.length,
    isTranslating,
    generateTranslation,
    readableContent,
    entry,
    targetLanguage,
    cachedTranslation,
  ])

  // Auto-translate when entry is selected
  useEffect(() => {
    if (!autoTranslate || !entry || isTranslating) return
    if (manuallyDisabledRef.current) return
    if (translatedContent || originalBlocks.length > 0) return

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
    translatedContent,
    originalBlocks.length,
    isTranslating,
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
    translatedContent,
    translatedContentBlocks,
    combinedTranslatedContent,
    handleToggleTranslation,
  }
}
