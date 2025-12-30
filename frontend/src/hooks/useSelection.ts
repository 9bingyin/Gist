import { useState, useCallback } from 'react'

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
}

export function useSelection(): UseSelectionReturn {
  const [selection, setSelection] = useState<SelectionType>({ type: 'all' })
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)

  const selectAll = useCallback(() => {
    setSelection({ type: 'all' })
    setSelectedEntryId(null)
  }, [])

  const selectFeed = useCallback((feedId: string) => {
    setSelection({ type: 'feed', feedId })
    setSelectedEntryId(null)
  }, [])

  const selectFolder = useCallback((folderId: string) => {
    setSelection({ type: 'folder', folderId })
    setSelectedEntryId(null)
  }, [])

  const selectEntry = useCallback((entryId: string | null) => {
    setSelectedEntryId(entryId)
  }, [])

  return {
    selection,
    selectAll,
    selectFeed,
    selectFolder,
    selectedEntryId,
    selectEntry,
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
