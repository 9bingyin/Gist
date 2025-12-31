import type {
  ApiErrorResponse,
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

export async function createFolder(payload: { name: string; parentId?: string }): Promise<Folder> {
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
  if (params.unreadOnly) {
    searchParams.set('unreadOnly', 'true')
  }
  if (params.starredOnly) {
    searchParams.set('starredOnly', 'true')
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

export function exportOPML(): void {
  const url = `${API_BASE_URL}/api/opml/export`
  window.location.href = url
}
