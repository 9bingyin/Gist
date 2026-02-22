import { useCallback, useEffect, useMemo } from 'react'
import { useLocation, useSearch } from 'wouter'
import { parseRoute, buildPath } from '@/lib/router'
import { useGeneralSettings } from '@/hooks/useGeneralSettings'
import type { ContentType } from '@/types/api'

export type SelectionType =
  | { type: 'all' }
  | { type: 'feed'; feedId: string }
  | { type: 'folder'; folderId: string }
  | { type: 'starred' }

interface NavigateOptions {
  replace?: boolean
}

interface UseSelectionReturn {
  selection: SelectionType
  selectAll: (contentType?: ContentType, options?: NavigateOptions) => void
  selectFeed: (feedId: string, options?: NavigateOptions) => void
  selectFolder: (folderId: string, options?: NavigateOptions) => void
  selectStarred: (options?: NavigateOptions) => void
  selectedEntryId: string | null
  selectEntry: (entryId: string | null, options?: NavigateOptions) => void
  unreadOnly: boolean
  toggleUnreadOnly: () => void
  contentType: ContentType
  setContentType: (contentType: ContentType) => void
}

export function useSelection(): UseSelectionReturn {
  const [location, navigate] = useLocation()
  const search = useSearch()

  const { data: generalSettings } = useGeneralSettings()
  const defaultShowUnread = generalSettings?.defaultShowUnread ?? false
  const unreadParamPresent = useMemo(() => {
    try {
      return new URLSearchParams(search).has('unread')
    } catch {
      return false
    }
  }, [search])

  const routeState = useMemo(
    () => parseRoute(location, search),
    [location, search]
  )

  // If user didn't explicitly specify unread filter, apply default from settings.
  // We write it into the URL so it behaves consistently across navigation.
  useEffect(() => {
    if (unreadParamPresent) return
    if (!defaultShowUnread) return
    if (routeState.unreadOnly) return

    navigate(
      buildPath(routeState.selection, routeState.entryId, true, routeState.contentType, { explicitUnreadParam: true }),
      { replace: true }
    )
  }, [unreadParamPresent, defaultShowUnread, routeState.selection, routeState.entryId, routeState.unreadOnly, routeState.contentType, navigate])

  const selectAll = useCallback(
    (contentType?: ContentType, options?: NavigateOptions) => {
      navigate(buildPath({ type: 'all' }, null, routeState.unreadOnly, contentType ?? routeState.contentType, { explicitUnreadParam: unreadParamPresent }), options)
    },
    [navigate, routeState.unreadOnly, routeState.contentType, unreadParamPresent]
  )

  const selectFeed = useCallback(
    (feedId: string, options?: NavigateOptions) => {
      navigate(buildPath({ type: 'feed', feedId }, null, routeState.unreadOnly, routeState.contentType, { explicitUnreadParam: unreadParamPresent }), options)
    },
    [navigate, routeState.unreadOnly, routeState.contentType, unreadParamPresent]
  )

  const selectFolder = useCallback(
    (folderId: string, options?: NavigateOptions) => {
      navigate(buildPath({ type: 'folder', folderId }, null, routeState.unreadOnly, routeState.contentType, { explicitUnreadParam: unreadParamPresent }), options)
    },
    [navigate, routeState.unreadOnly, routeState.contentType, unreadParamPresent]
  )

  const selectStarred = useCallback((options?: NavigateOptions) => {
    navigate(buildPath({ type: 'starred' }, null, routeState.unreadOnly, routeState.contentType, { explicitUnreadParam: unreadParamPresent }), options)
  }, [navigate, routeState.unreadOnly, routeState.contentType, unreadParamPresent])

  const selectEntry = useCallback(
    (entryId: string | null, options?: NavigateOptions) => {
      navigate(buildPath(routeState.selection, entryId, routeState.unreadOnly, routeState.contentType, { explicitUnreadParam: unreadParamPresent }), options)
    },
    [navigate, routeState.selection, routeState.unreadOnly, routeState.contentType, unreadParamPresent]
  )

  const toggleUnreadOnly = useCallback(() => {
    const nextUnreadOnly = !routeState.unreadOnly
    const explicitUnreadParam = nextUnreadOnly ? true : (unreadParamPresent || defaultShowUnread)
    navigate(
      buildPath(routeState.selection, routeState.entryId, nextUnreadOnly, routeState.contentType, { explicitUnreadParam }),
      { replace: true }
    )
  }, [navigate, routeState.selection, routeState.entryId, routeState.unreadOnly, routeState.contentType, unreadParamPresent, defaultShowUnread])

  const setContentType = useCallback(
    (contentType: ContentType) => {
      navigate(buildPath(routeState.selection, routeState.entryId, routeState.unreadOnly, contentType, { explicitUnreadParam: unreadParamPresent }))
    },
    [navigate, routeState.selection, routeState.entryId, routeState.unreadOnly, unreadParamPresent]
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
