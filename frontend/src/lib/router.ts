import type { SelectionType } from '@/hooks/useSelection'

export interface RouteState {
  selection: SelectionType
  entryId: string | null
  unreadOnly: boolean
}

/**
 * Parse URL pathname and search params into route state
 */
export function parseRoute(pathname: string, search: string): RouteState {
  const params = new URLSearchParams(search)
  const unreadOnly = params.get('unread') === 'true'

  // Remove leading slash and split
  const segments = pathname.replace(/^\//, '').split('/').filter(Boolean)

  // Default: /all or /
  if (segments.length === 0 || segments[0] === 'all') {
    return {
      selection: { type: 'all' },
      entryId: segments[1] || null,
      unreadOnly,
    }
  }

  // /feed/:feedId/:entryId?
  if (segments[0] === 'feed' && segments[1]) {
    return {
      selection: { type: 'feed', feedId: segments[1] },
      entryId: segments[2] || null,
      unreadOnly,
    }
  }

  // /folder/:folderId/:entryId?
  if (segments[0] === 'folder' && segments[1]) {
    return {
      selection: { type: 'folder', folderId: segments[1] },
      entryId: segments[2] || null,
      unreadOnly,
    }
  }

  // /starred/:entryId?
  if (segments[0] === 'starred') {
    return {
      selection: { type: 'starred' },
      entryId: segments[1] || null,
      unreadOnly,
    }
  }

  // Fallback to all
  return {
    selection: { type: 'all' },
    entryId: null,
    unreadOnly,
  }
}

/**
 * Build URL path from route state
 */
export function buildPath(
  selection: SelectionType,
  entryId?: string | null,
  unreadOnly?: boolean
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

  if (unreadOnly) {
    path += '?unread=true'
  }

  return path
}

/**
 * Check if current path is add-feed page
 */
export function isAddFeedPath(pathname: string): boolean {
  return pathname === '/add-feed'
}
