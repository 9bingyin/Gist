import { describe, expect, it } from 'vitest'
import { countLoadedEntries, flattenUniqueEntries } from './entry-pagination'
import type { EntryListResponse } from '@/types/api'

function makePage(ids: string[]): Pick<EntryListResponse, 'entries'> {
  return {
    entries: ids.map((id) => ({
      id,
      feedId: 'feed-1',
      title: `Entry ${id}`,
      read: false,
      starred: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    })),
  }
}

describe('entry pagination helpers', () => {
  it('should count entries using the actual loaded page sizes', () => {
    const pages = [makePage(['1', '2', '3']), makePage(['4']), makePage(['5', '6'])]

    expect(countLoadedEntries(pages)).toBe(6)
  })

  it('should flatten pages while removing duplicate entries by id', () => {
    const pages = [makePage(['1', '2', '3']), makePage(['3', '4']), makePage(['4', '5'])]

    expect(flattenUniqueEntries(pages).map((entry) => entry.id)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
    ])
  })

  it('should return an empty array when no pages exist', () => {
    expect(flattenUniqueEntries(undefined)).toEqual([])
  })
})
