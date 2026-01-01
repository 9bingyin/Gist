import { streamBatchTranslate, type BatchTranslateArticle } from '@/api'
import { translationActions } from '@/stores/translation-store'

// Track in-flight requests to prevent duplicate calls
const inFlightRequests = new Map<string, Promise<void>>()
// Track articles currently being translated in batch
const inFlightBatchArticles = new Set<string>()
// Track AbortController for batch translations
let batchAbortController: AbortController | null = null

interface TranslateArticleParams {
  articleId: string
  title: string
  summary: string | null
  content: string
  isReadability?: boolean
  targetLanguage: string
}

/**
 * Translate a full article using the block-based translation API.
 * This is for detail view where we need full content translation.
 */
export async function translateArticle(
  params: TranslateArticleParams,
  signal?: AbortSignal
): Promise<void> {
  const { articleId, isReadability } = params
  const requestKey = `${articleId}-${isReadability ? 'readability' : 'normal'}`

  // Skip if article is being translated in batch
  if (inFlightBatchArticles.has(articleId)) {
    return
  }

  // Return existing in-flight request if any
  const existingRequest = inFlightRequests.get(requestKey)
  if (existingRequest) {
    return existingRequest
  }

  // Note: Content translation uses the existing streamTranslateBlocks API
  // This function is just for tracking purposes
  const request = (async () => {
    // The actual translation is handled by the component using streamTranslateBlocks
    // This service just tracks the in-flight status
  })()

  inFlightRequests.set(requestKey, request)

  // Clean up on abort
  if (signal) {
    signal.addEventListener(
      'abort',
      () => {
        inFlightRequests.delete(requestKey)
      },
      { once: true }
    )
  }

  return request
}

/**
 * Mark an article as being translated (for content translation).
 * Call this when starting content translation to prevent duplicate batch translations.
 */
export function markArticleTranslating(articleId: string, isReadability: boolean): void {
  const requestKey = `${articleId}-${isReadability ? 'readability' : 'normal'}`
  inFlightRequests.set(requestKey, Promise.resolve())
}

/**
 * Mark an article as done translating.
 */
export function markArticleTranslated(articleId: string, isReadability: boolean): void {
  const requestKey = `${articleId}-${isReadability ? 'readability' : 'normal'}`
  inFlightRequests.delete(requestKey)
}

/**
 * Check if an article is currently being translated.
 */
export function isArticleTranslating(articleId: string): boolean {
  return (
    inFlightRequests.has(`${articleId}-normal`) ||
    inFlightRequests.has(`${articleId}-readability`) ||
    inFlightBatchArticles.has(articleId)
  )
}

/**
 * Cancel all pending batch translations.
 * Call this when switching lists to prevent stale requests.
 */
export function cancelAllBatchTranslations(): void {
  if (batchAbortController) {
    batchAbortController.abort()
    batchAbortController = null
  }
  // Clear all in-flight batch articles
  inFlightBatchArticles.clear()
}

/**
 * Translate multiple articles' titles and summaries (for list view).
 * Uses NDJSON streaming - updates store as each translation completes.
 */
export async function translateArticlesBatch(
  articles: Array<{ id: string; title: string; summary: string | null }>,
  targetLanguage: string
): Promise<void> {
  // Filter out articles already being translated
  const articlesToTranslate = articles.filter(
    (a) =>
      !inFlightRequests.has(`${a.id}-normal`) &&
      !inFlightRequests.has(`${a.id}-readability`) &&
      !inFlightBatchArticles.has(a.id)
  )

  if (articlesToTranslate.length === 0) return

  // Cancel any existing batch translation
  if (batchAbortController) {
    batchAbortController.abort()
  }

  // Create new AbortController for this batch
  batchAbortController = new AbortController()
  const signal = batchAbortController.signal

  // Mark articles as being translated in batch
  for (const article of articlesToTranslate) {
    inFlightBatchArticles.add(article.id)
  }

  try {
    // Convert to API format
    const apiArticles: BatchTranslateArticle[] = articlesToTranslate.map((a) => ({
      id: a.id,
      title: a.title,
      summary: a.summary ?? '',
    }))

    // Stream results and update store
    for await (const result of streamBatchTranslate(apiArticles, signal)) {
      translationActions.set(result.id, targetLanguage, {
        title: result.title,
        summary: result.summary,
      })
    }
  } catch (error) {
    // Ignore abort errors
    if (error instanceof Error && error.name === 'AbortError') {
      return
    }
    throw error
  } finally {
    // Clean up batch tracking
    for (const article of articlesToTranslate) {
      inFlightBatchArticles.delete(article.id)
    }
  }
}
