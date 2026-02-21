import type { SelectionType } from '@/hooks/useSelection'
import type { ContentType } from '@/types/api'

export interface RouteState {
  selection: SelectionType
  entryId: string | null
  unreadOnly: boolean
  contentType: ContentType
}

export interface BuildPathOptions {
  /**
   * When true and unreadOnly is false, include `unread=false` in the URL.
   * This is used to preserve an explicit user override (e.g. when the default is "show unread").
   */
  explicitUnreadParam?: boolean
}

function parseContentType(value: string | null): ContentType {
  if (value === 'picture' || value === 'notification') {
    return value
  }
  return 'article'
}

/**
 * Parse URL pathname and search params into route state
 */
export function parseRoute(pathname: string, search: string): RouteState {
  const params = new URLSearchParams(search)
  const unreadOnly = params.get('unread') === 'true'
  const contentType = parseContentType(params.get('type'))

  // Remove leading slash and split
  const segments = pathname.replace(/^\//, '').split('/').filter(Boolean)

  // Default: /all or /
  if (segments.length === 0 || segments[0] === 'all') {
    return {
      selection: { type: 'all' },
      entryId: segments[1] || null,
      unreadOnly,
      contentType,
    }
  }

  // /feed/:feedId/:entryId?
  if (segments[0] === 'feed' && segments[1]) {
    return {
      selection: { type: 'feed', feedId: segments[1] },
      entryId: segments[2] || null,
      unreadOnly,
      contentType,
    }
  }

  // /folder/:folderId/:entryId?
  if (segments[0] === 'folder' && segments[1]) {
    return {
      selection: { type: 'folder', folderId: segments[1] },
      entryId: segments[2] || null,
      unreadOnly,
      contentType,
    }
  }

  // /starred/:entryId?
  if (segments[0] === 'starred') {
    return {
      selection: { type: 'starred' },
      entryId: segments[1] || null,
      unreadOnly,
      contentType,
    }
  }

  // Fallback to all
  return {
    selection: { type: 'all' },
    entryId: null,
    unreadOnly,
    contentType,
  }
}

/**
 * Build URL path from route state
 */
export function buildPath(
  selection: SelectionType,
  entryId?: string | null,
  unreadOnly?: boolean,
  contentType?: ContentType,
  options?: BuildPathOptions
): string {
  let path: string

  switch (selection.type) {
    case 'all':
      path = entryId ? `/all/${entryId}` : '/all'
      break
    case 'feed':
      path = entryId ? `/feed/${selection.feedId}/${entryId}` : `/feed/${selection.feedId}`
      break
    case 'folder':
      path = entryId ? `/folder/${selection.folderId}/${entryId}` : `/folder/${selection.folderId}`
      break
    case 'starred':
      path = entryId ? `/starred/${entryId}` : '/starred'
      break
  }

  const params = new URLSearchParams()
  if (unreadOnly === true) {
    params.set('unread', 'true')
  } else if (unreadOnly === false && options?.explicitUnreadParam) {
    params.set('unread', 'false')
  }
  if (contentType) {
    params.set('type', contentType)
  }
  const queryString = params.toString()
  if (queryString) {
    path += '?' + queryString
  }

  return path
}

/**
 * Check if current path is add-feed page
 */
export function isAddFeedPath(pathname: string): boolean {
  return pathname === '/add-feed'
}
