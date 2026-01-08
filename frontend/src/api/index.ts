import type {
  ApiErrorResponse,
  ContentType,
  Entry,
  EntryListParams,
  EntryListResponse,
  Feed,
  FeedPreview,
  Folder,
  ImportTask,
  MarkAllReadParams,
  StarredCountResponse,
  UnreadCountsResponse,
} from '@/types/api'
import type { AISettings, AITestRequest, AITestResponse, GeneralSettings } from '@/types/settings'

const API_BASE_URL = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

function isErrorResponse(value: unknown): value is ApiErrorResponse {
  if (typeof value !== 'object' || value === null) return false
  if (!('error' in value)) return false
  return typeof (value as { error: unknown }).error === 'string'
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null

  const contentType = response.headers.get('Content-Type') ?? ''
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(text) as unknown
    } catch {
      return text
    }
  }

  return text
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${path}`
  const headers = new Headers(options.headers)
  const body = options.body

  if (body && !(body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })

  const data = await parseResponse(response)
  if (!response.ok) {
    const message = isErrorResponse(data)
      ? data.error
      : typeof data === 'string'
        ? data
        : response.statusText
    throw new ApiError(message || 'Request failed', response.status)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return data as T
}

export async function listFolders(): Promise<Folder[]> {
  return request<Folder[]>('/api/folders')
}

export async function createFolder(payload: {
  name: string
  parentId?: string
  type?: ContentType
}): Promise<Folder> {
  return request<Folder>('/api/folders', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateFolder(
  id: string,
  payload: { name: string; parentId?: string }
): Promise<Folder> {
  return request<Folder>(`/api/folders/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function deleteFolder(id: string): Promise<void> {
  return request<void>(`/api/folders/${id}`, {
    method: 'DELETE',
  })
}

export async function updateFolderType(id: string, type: ContentType): Promise<void> {
  return request<void>(`/api/folders/${id}/type`, {
    method: 'PATCH',
    body: JSON.stringify({ type }),
  })
}

export async function deleteFolders(ids: string[]): Promise<void> {
  return request<void>('/api/folders', {
    method: 'DELETE',
    body: JSON.stringify({ ids }),
  })
}

export async function listFeeds(folderId?: string): Promise<Feed[]> {
  const params = folderId === undefined ? '' : `?folderId=${encodeURIComponent(folderId)}`
  return request<Feed[]>(`/api/feeds${params}`)
}

export async function createFeed(payload: {
  url: string
  folderId?: string
  title?: string
  type?: ContentType
}): Promise<Feed> {
  return request<Feed>('/api/feeds', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateFeed(
  id: string,
  payload: { title: string; folderId?: string }
): Promise<Feed> {
  return request<Feed>(`/api/feeds/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function deleteFeed(id: string): Promise<void> {
  return request<void>(`/api/feeds/${id}`, {
    method: 'DELETE',
  })
}

export async function updateFeedType(id: string, type: ContentType): Promise<void> {
  return request<void>(`/api/feeds/${id}/type`, {
    method: 'PATCH',
    body: JSON.stringify({ type }),
  })
}

export async function deleteFeeds(ids: string[]): Promise<void> {
  return request<void>('/api/feeds', {
    method: 'DELETE',
    body: JSON.stringify({ ids }),
  })
}

export async function refreshAllFeeds(): Promise<void> {
  return request<void>('/api/feeds/refresh', {
    method: 'POST',
  })
}

export async function previewFeed(url: string): Promise<FeedPreview> {
  const params = new URLSearchParams({ url })
  return request<FeedPreview>(`/api/feeds/preview?${params.toString()}`)
}

export async function listEntries(params: EntryListParams = {}): Promise<EntryListResponse> {
  const searchParams = new URLSearchParams()

  if (params.feedId !== undefined) {
    searchParams.set('feedId', String(params.feedId))
  }
  if (params.folderId !== undefined) {
    searchParams.set('folderId', String(params.folderId))
  }
  if (params.contentType !== undefined) {
    searchParams.set('contentType', params.contentType)
  }
  if (params.unreadOnly) {
    searchParams.set('unreadOnly', 'true')
  }
  if (params.starredOnly) {
    searchParams.set('starredOnly', 'true')
  }
  if (params.hasThumbnail) {
    searchParams.set('hasThumbnail', 'true')
  }
  if (params.limit !== undefined) {
    searchParams.set('limit', String(params.limit))
  }
  if (params.offset !== undefined) {
    searchParams.set('offset', String(params.offset))
  }

  const queryString = searchParams.toString()
  const path = queryString ? `/api/entries?${queryString}` : '/api/entries'
  return request<EntryListResponse>(path)
}

export async function getEntry(id: string): Promise<Entry> {
  return request<Entry>(`/api/entries/${id}`)
}

export async function updateEntryReadStatus(id: string, read: boolean): Promise<void> {
  return request<void>(`/api/entries/${id}/read`, {
    method: 'PATCH',
    body: JSON.stringify({ read }),
  })
}

export async function fetchReadableContent(id: string): Promise<string> {
  const response = await request<{ readableContent: string }>(`/api/entries/${id}/fetch-readable`, {
    method: 'POST',
  })
  return response.readableContent
}

export async function markAllAsRead(params: MarkAllReadParams): Promise<void> {
  return request<void>('/api/entries/mark-read', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export async function getUnreadCounts(): Promise<UnreadCountsResponse> {
  return request<UnreadCountsResponse>('/api/unread-counts')
}

export async function updateEntryStarred(id: string, starred: boolean): Promise<void> {
  return request<void>(`/api/entries/${id}/starred`, {
    method: 'PATCH',
    body: JSON.stringify({ starred }),
  })
}

export async function getStarredCount(): Promise<StarredCountResponse> {
  return request<StarredCountResponse>('/api/starred-count')
}

export async function startImportOPML(file: File): Promise<void> {
  const formData = new FormData()
  formData.append('file', file)

  const url = `${API_BASE_URL}/api/opml/import`
  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new ApiError(text || 'Import failed', response.status)
  }
}

export async function cancelImportOPML(): Promise<boolean> {
  const result = await request<{ cancelled: boolean }>('/api/opml/import', {
    method: 'DELETE',
  })
  return result.cancelled
}

export function watchImportStatus(onUpdate: (task: ImportTask) => void): () => void {
  const url = `${API_BASE_URL}/api/opml/import/status`
  let cancelled = false

  const connect = async () => {
    try {
      const response = await fetch(url)
      if (!response.ok || !response.body) return

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (!cancelled) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const task = JSON.parse(line.slice(6)) as ImportTask
              onUpdate(task)

              // Stop if done, error, or cancelled
              if (task.status === 'done' || task.status === 'error' || task.status === 'cancelled') {
                cancelled = true
                reader.cancel()
                return
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      }
    } catch {
      // connection error, ignore
    }
  }

  connect()

  return () => {
    cancelled = true
  }
}

export async function exportOPML(): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/opml/export`)
  if (!response.ok) {
    throw new ApiError('Export failed', response.status)
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'gist.opml'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function getAISettings(): Promise<AISettings> {
  return request<AISettings>('/api/settings/ai')
}

export async function updateAISettings(settings: AISettings): Promise<AISettings> {
  return request<AISettings>('/api/settings/ai', {
    method: 'PUT',
    body: JSON.stringify(settings),
  })
}

export async function testAIConnection(config: AITestRequest): Promise<AITestResponse> {
  return request<AITestResponse>('/api/settings/ai/test', {
    method: 'POST',
    body: JSON.stringify(config),
  })
}

export async function getGeneralSettings(): Promise<GeneralSettings> {
  return request<GeneralSettings>('/api/settings/general')
}

export async function updateGeneralSettings(settings: GeneralSettings): Promise<GeneralSettings> {
  return request<GeneralSettings>('/api/settings/general', {
    method: 'PUT',
    body: JSON.stringify(settings),
  })
}

export interface SummarizeRequest {
  entryId: string
  content: string
  title?: string
  isReadability?: boolean
}

export interface SummarizeResponse {
  summary: string
  cached: boolean
}

export async function* streamSummary(
  req: SummarizeRequest,
  signal?: AbortSignal
): AsyncGenerator<string | { cached: true; summary: string }> {
  const url = `${API_BASE_URL}/api/ai/summarize`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  })

  if (!response.ok) {
    const data = await parseResponse(response)
    const message = isErrorResponse(data)
      ? data.error
      : typeof data === 'string'
        ? data
        : response.statusText
    throw new ApiError(message || 'Request failed', response.status)
  }

  const contentType = response.headers.get('Content-Type') ?? ''

  // If cached, returns JSON
  if (contentType.includes('application/json')) {
    const data = (await response.json()) as SummarizeResponse
    yield { cached: true, summary: data.summary }
    return
  }

  // Otherwise, stream the response
  if (!response.body) {
    throw new ApiError('No response body', 500)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const text = decoder.decode(value, { stream: true })
      if (text) {
        yield text
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export interface TranslateRequest {
  entryId: string
  content: string
  title?: string
  isReadability?: boolean
}

export interface TranslateResponse {
  content: string
  cached: boolean
}

export interface TranslateBlockData {
  index: number
  html: string
  needTranslate: boolean
}

export interface TranslateInit {
  blocks: TranslateBlockData[]
}

export interface TranslateBlockResult {
  index: number
  html: string
}

export interface TranslateDone {
  done: true
}

export interface TranslateError {
  error: string
}

export type TranslateEvent = TranslateInit | TranslateBlockResult | TranslateDone | TranslateError

function isTranslateInit(event: TranslateEvent): event is TranslateInit {
  return 'blocks' in event && Array.isArray(event.blocks)
}

function isTranslateBlockResult(event: TranslateEvent): event is TranslateBlockResult {
  return 'index' in event && 'html' in event && !('blocks' in event)
}

function isTranslateDone(event: TranslateEvent): event is TranslateDone {
  return 'done' in event && event.done === true
}

function isTranslateError(event: TranslateEvent): event is TranslateError {
  return 'error' in event
}

export async function* streamTranslateBlocks(
  req: TranslateRequest,
  signal?: AbortSignal
): AsyncGenerator<TranslateEvent | { cached: true; content: string }> {
  const url = `${API_BASE_URL}/api/ai/translate`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  })

  if (!response.ok) {
    const data = await parseResponse(response)
    const message = isErrorResponse(data)
      ? data.error
      : typeof data === 'string'
        ? data
        : response.statusText
    throw new ApiError(message || 'Request failed', response.status)
  }

  const contentType = response.headers.get('Content-Type') ?? ''

  // Cached response returns JSON
  if (contentType.includes('application/json')) {
    const data = (await response.json()) as TranslateResponse
    yield { cached: true, content: data.content }
    return
  }

  // SSE stream
  if (!response.body) {
    throw new ApiError('No response body', 500)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6)) as TranslateEvent
            yield data
          } catch {
            // Ignore parse errors
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

// Re-export type guards for use in components
export { isTranslateInit, isTranslateBlockResult, isTranslateDone, isTranslateError }

// Keep the old function for backwards compatibility (returns full content)
export async function translateContent(
  req: TranslateRequest,
  signal?: AbortSignal
): Promise<TranslateResponse> {
  return request<TranslateResponse>('/api/ai/translate', {
    method: 'POST',
    body: JSON.stringify(req),
    signal,
  })
}

// Batch translation types
export interface BatchTranslateArticle {
  id: string
  title: string
  summary: string
}

export interface BatchTranslateResult {
  id: string
  title: string | null
  summary: string | null
  cached?: boolean
}

/**
 * Stream batch translation results using NDJSON format.
 * Each line is a JSON object with the translation result.
 */
export async function* streamBatchTranslate(
  articles: BatchTranslateArticle[],
  signal?: AbortSignal
): AsyncGenerator<BatchTranslateResult> {
  const url = `${API_BASE_URL}/api/ai/translate/batch`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ articles }),
    signal,
  })

  if (!response.ok) {
    const data = await parseResponse(response)
    const message = isErrorResponse(data)
      ? data.error
      : typeof data === 'string'
        ? data
        : response.statusText
    throw new ApiError(message || 'Request failed', response.status)
  }

  if (!response.body) {
    throw new ApiError('No response body', 500)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.trim()) {
          try {
            const result = JSON.parse(line) as BatchTranslateResult
            yield result
          } catch {
            // Ignore parse errors
          }
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      try {
        const result = JSON.parse(buffer) as BatchTranslateResult
        yield result
      } catch {
        // Ignore parse errors
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export interface ClearAICacheResponse {
  summaries: number
  translations: number
  listTranslations: number
}

export async function clearAICache(): Promise<ClearAICacheResponse> {
  return request<ClearAICacheResponse>('/api/ai/cache', {
    method: 'DELETE',
  })
}

export interface ClearCacheResponse {
  deleted: number
}

export async function clearAnubisCookies(): Promise<ClearCacheResponse> {
  return request<ClearCacheResponse>('/api/settings/anubis-cookies', {
    method: 'DELETE',
  })
}

export async function clearIconCache(): Promise<ClearCacheResponse> {
  return request<ClearCacheResponse>('/api/icons/cache', {
    method: 'DELETE',
  })
}

export async function clearReadabilityCache(): Promise<ClearCacheResponse> {
  return request<ClearCacheResponse>('/api/entries/readability-cache', {
    method: 'DELETE',
  })
}

export async function clearEntryCache(): Promise<ClearCacheResponse> {
  return request<ClearCacheResponse>('/api/entries/cache', {
    method: 'DELETE',
  })
}
