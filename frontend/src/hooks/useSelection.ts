import { useCallback, useMemo } from 'react'
import { useLocation, useSearch } from 'wouter'
import { parseRoute, buildPath } from '@/lib/router'
import type { ContentType } from '@/types/api'

export type SelectionType =
  | { type: 'all' }
  | { type: 'feed'; feedId: string }
  | { type: 'folder'; folderId: string }
  | { type: 'starred' }

interface UseSelectionReturn {
  selection: SelectionType
  selectAll: (contentType?: ContentType) => void
  selectFeed: (feedId: string) => void
  selectFolder: (folderId: string) => void
  selectStarred: () => void
  selectedEntryId: string | null
  selectEntry: (entryId: string | null) => void
  unreadOnly: boolean
  toggleUnreadOnly: () => void
  contentType: ContentType
  setContentType: (contentType: ContentType) => void
}

export function useSelection(): UseSelectionReturn {
  const [location, navigate] = useLocation()
  const search = useSearch()

  const routeState = useMemo(
    () => parseRoute(location, search),
    [location, search]
  )

  const selectAll = useCallback(
    (contentType?: ContentType) => {
      navigate(buildPath({ type: 'all' }, null, routeState.unreadOnly, contentType ?? routeState.contentType))
    },
    [navigate, routeState.unreadOnly, routeState.contentType]
  )

  const selectFeed = useCallback(
    (feedId: string) => {
      navigate(buildPath({ type: 'feed', feedId }, null, routeState.unreadOnly, routeState.contentType))
    },
    [navigate, routeState.unreadOnly, routeState.contentType]
  )

  const selectFolder = useCallback(
    (folderId: string) => {
      navigate(buildPath({ type: 'folder', folderId }, null, routeState.unreadOnly, routeState.contentType))
    },
    [navigate, routeState.unreadOnly, routeState.contentType]
  )

  const selectStarred = useCallback(() => {
    navigate(buildPath({ type: 'starred' }, null, routeState.unreadOnly, routeState.contentType))
  }, [navigate, routeState.unreadOnly, routeState.contentType])

  const selectEntry = useCallback(
    (entryId: string | null) => {
      navigate(buildPath(routeState.selection, entryId, routeState.unreadOnly, routeState.contentType))
    },
    [navigate, routeState.selection, routeState.unreadOnly, routeState.contentType]
  )

  const toggleUnreadOnly = useCallback(() => {
    navigate(buildPath(routeState.selection, routeState.entryId, !routeState.unreadOnly, routeState.contentType))
  }, [navigate, routeState.selection, routeState.entryId, routeState.unreadOnly, routeState.contentType])

  const setContentType = useCallback(
    (contentType: ContentType) => {
      navigate(buildPath(routeState.selection, routeState.entryId, routeState.unreadOnly, contentType))
    },
    [navigate, routeState.selection, routeState.entryId, routeState.unreadOnly]
  )

  return {
    selection: routeState.selection,
    selectAll,
    selectFeed,
    selectFolder,
    selectStarred,
    selectedEntryId: routeState.entryId,
    selectEntry,
    unreadOnly: routeState.unreadOnly,
    toggleUnreadOnly,
    contentType: routeState.contentType,
    setContentType,
  }
}

export function selectionToParams(
  selection: SelectionType,
  contentType?: ContentType
): { feedId?: string; folderId?: string; starredOnly?: boolean; contentType?: ContentType } {
  const base: { feedId?: string; folderId?: string; starredOnly?: boolean; contentType?: ContentType } = {}

  // Only include contentType for 'all' selection since feed/folder already filter by their own type
  if (selection.type === 'all' && contentType) {
    base.contentType = contentType
  }

  switch (selection.type) {
    case 'all':
      return base
    case 'feed':
      return { ...base, feedId: selection.feedId }
    case 'folder':
      return { ...base, folderId: selection.folderId }
    case 'starred':
      return { ...base, starredOnly: true }
  }
}
