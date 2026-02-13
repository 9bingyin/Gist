import type { VirtualItem } from '@tanstack/react-virtual'
import type { SelectionType } from '@/hooks/useSelection'
import type { ContentType } from '@/types/api'

export function selectionScrollKey(selection: SelectionType, contentType: ContentType): string {
  switch (selection.type) {
    case 'all': return `all:${contentType}`
    case 'feed': return `feed:${selection.feedId}:${contentType}`
    case 'folder': return `folder:${selection.folderId}:${contentType}`
    case 'starred': return `starred:${contentType}`
  }
}

// Module-level caches for EntryList scroll position restoration.
// Survive unmount/remount (e.g., switching to/from picture mode).
export const entryListScrollPositions = new Map<string, number>()
export const entryListMeasurementsCache = new Map<string, VirtualItem[]>()
