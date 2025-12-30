import { useCallback, useMemo } from 'react'
import { useLocation, useSearch } from 'wouter'
import { parseRoute, buildPath } from '@/lib/router'

export type SelectionType =
  | { type: 'all' }
  | { type: 'feed'; feedId: string }
  | { type: 'folder'; folderId: string }

interface UseSelectionReturn {
  selection: SelectionType
  selectAll: () => void
  selectFeed: (feedId: string) => void
  selectFolder: (folderId: string) => void
  selectedEntryId: string | null
  selectEntry: (entryId: string | null) => void
  unreadOnly: boolean
  toggleUnreadOnly: () => void
}

export function useSelection(): UseSelectionReturn {
  const [location, navigate] = useLocation()
  const search = useSearch()

  const routeState = useMemo(
    () => parseRoute(location, search),
    [location, search]
  )

  const selectAll = useCallback(() => {
    navigate(buildPath({ type: 'all' }, null, routeState.unreadOnly))
  }, [navigate, routeState.unreadOnly])

  const selectFeed = useCallback(
    (feedId: string) => {
      navigate(buildPath({ type: 'feed', feedId }, null, routeState.unreadOnly))
    },
    [navigate, routeState.unreadOnly]
  )

  const selectFolder = useCallback(
    (folderId: string) => {
      navigate(buildPath({ type: 'folder', folderId }, null, routeState.unreadOnly))
    },
    [navigate, routeState.unreadOnly]
  )

  const selectEntry = useCallback(
    (entryId: string | null) => {
      navigate(buildPath(routeState.selection, entryId, routeState.unreadOnly))
    },
    [navigate, routeState.selection, routeState.unreadOnly]
  )

  const toggleUnreadOnly = useCallback(() => {
    navigate(buildPath(routeState.selection, routeState.entryId, !routeState.unreadOnly))
  }, [navigate, routeState.selection, routeState.entryId, routeState.unreadOnly])

  return {
    selection: routeState.selection,
    selectAll,
    selectFeed,
    selectFolder,
    selectedEntryId: routeState.entryId,
    selectEntry,
    unreadOnly: routeState.unreadOnly,
    toggleUnreadOnly,
  }
}

export function selectionToParams(selection: SelectionType): { feedId?: string; folderId?: string } {
  switch (selection.type) {
    case 'all':
      return {}
    case 'feed':
      return { feedId: selection.feedId }
    case 'folder':
      return { folderId: selection.folderId }
  }
}
