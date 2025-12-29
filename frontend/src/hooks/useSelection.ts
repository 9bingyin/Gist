import { useState, useCallback } from 'react'

export type SelectionType =
  | { type: 'all' }
  | { type: 'feed'; feedId: number }
  | { type: 'folder'; folderId: number }

interface UseSelectionReturn {
  selection: SelectionType
  selectAll: () => void
  selectFeed: (feedId: number) => void
  selectFolder: (folderId: number) => void
  selectedEntryId: number | null
  selectEntry: (entryId: number | null) => void
}

export function useSelection(): UseSelectionReturn {
  const [selection, setSelection] = useState<SelectionType>({ type: 'all' })
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null)

  const selectAll = useCallback(() => {
    setSelection({ type: 'all' })
    setSelectedEntryId(null)
  }, [])

  const selectFeed = useCallback((feedId: number) => {
    setSelection({ type: 'feed', feedId })
    setSelectedEntryId(null)
  }, [])

  const selectFolder = useCallback((folderId: number) => {
    setSelection({ type: 'folder', folderId })
    setSelectedEntryId(null)
  }, [])

  const selectEntry = useCallback((entryId: number | null) => {
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

export function selectionToParams(selection: SelectionType): { feedId?: number; folderId?: number } {
  switch (selection.type) {
    case 'all':
      return {}
    case 'feed':
      return { feedId: selection.feedId }
    case 'folder':
      return { folderId: selection.folderId }
  }
}
