import type { Entry, EntryListResponse } from '@/types/api'

type EntryPage = Pick<EntryListResponse, 'entries'>

export function countLoadedEntries(pages: readonly EntryPage[]): number {
  return pages.reduce((count, page) => count + page.entries.length, 0)
}

export function flattenUniqueEntries(
  pages: readonly EntryPage[] | undefined
): Entry[] {
  if (!pages || pages.length === 0) return []

  const seen = new Set<string>()
  const entries: Entry[] = []

  for (const page of pages) {
    for (const entry of page.entries) {
      if (seen.has(entry.id)) continue
      seen.add(entry.id)
      entries.push(entry)
    }
  }

  return entries
}
