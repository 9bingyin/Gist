import type {
  ApiErrorResponse,
  Entry,
  EntryListParams,
  EntryListResponse,
  Feed,
  FeedPreview,
  Folder,
  MarkAllReadParams,
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

export async function createFolder(payload: { name: string; parentId?: number }): Promise<Folder> {
  return request<Folder>('/api/folders', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateFolder(
  id: number,
  payload: { name: string; parentId?: number }
): Promise<Folder> {
  return request<Folder>(`/api/folders/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function deleteFolder(id: number): Promise<void> {
  return request<void>(`/api/folders/${id}`, {
    method: 'DELETE',
  })
}

export async function listFeeds(folderId?: number): Promise<Feed[]> {
  const params = folderId === undefined ? '' : `?folderId=${encodeURIComponent(String(folderId))}`
  return request<Feed[]>(`/api/feeds${params}`)
}

export async function createFeed(payload: {
  url: string
  folderId?: number
  title?: string
}): Promise<Feed> {
  return request<Feed>('/api/feeds', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateFeed(
  id: number,
  payload: { title: string; folderId?: number }
): Promise<Feed> {
  return request<Feed>(`/api/feeds/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function deleteFeed(id: number): Promise<void> {
  return request<void>(`/api/feeds/${id}`, {
    method: 'DELETE',
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

export async function getEntry(id: number): Promise<Entry> {
  return request<Entry>(`/api/entries/${id}`)
}

export async function updateEntryReadStatus(id: number, read: boolean): Promise<void> {
  return request<void>(`/api/entries/${id}/read`, {
    method: 'PATCH',
    body: JSON.stringify({ read }),
  })
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
