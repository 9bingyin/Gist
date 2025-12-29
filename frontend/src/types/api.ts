export interface Folder {
  id: number
  name: string
  parentId?: number
  createdAt: string
  updatedAt: string
}

export interface Feed {
  id: number
  folderId?: number
  title: string
  url: string
  siteUrl?: string
  description?: string
  etag?: string
  lastModified?: string
  createdAt: string
  updatedAt: string
}

export interface FeedPreview {
  url: string
  title: string
  description?: string
  siteUrl?: string
  imageUrl?: string
  itemCount?: number
  lastUpdated?: string
}

export interface Entry {
  id: number
  feedId: number
  title?: string
  url?: string
  content?: string
  author?: string
  publishedAt?: string
  read: boolean
  createdAt: string
  updatedAt: string
}

export interface EntryListResponse {
  entries: Entry[]
  hasMore: boolean
}

export interface EntryListParams {
  feedId?: number
  folderId?: number
  unreadOnly?: boolean
  limit?: number
  offset?: number
}

export interface UnreadCountsResponse {
  counts: Record<string, number>
}

export interface MarkAllReadParams {
  feedId?: number
  folderId?: number
}

export interface ApiErrorResponse {
  error: string
}
