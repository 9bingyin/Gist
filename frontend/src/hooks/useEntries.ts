import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import {
  listEntries,
  getEntry,
  updateEntryReadStatus,
  updateEntryStarred,
  markAllAsRead,
  getUnreadCounts,
  getStarredCount,
} from '@/api'
import type { Entry, EntryListParams, MarkAllReadParams } from '@/types/api'

function entriesQueryKey(params: EntryListParams) {
  return ['entries', params] as const
}

export function useEntriesInfinite(params: Omit<EntryListParams, 'offset'>) {
  const pageSize = params.limit ?? 50

  return useInfiniteQuery({
    queryKey: entriesQueryKey({ ...params, limit: pageSize }),
    queryFn: ({ pageParam = 0 }) =>
      listEntries({ ...params, limit: pageSize, offset: pageParam }),
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) return undefined
      return allPages.length * pageSize
    },
    initialPageParam: 0,
  })
}

export function useEntry(id: string | null) {
  return useQuery({
    queryKey: ['entry', id],
    queryFn: () => getEntry(id!),
    enabled: id !== null,
  })
}

export function useUnreadCounts() {
  return useQuery({
    queryKey: ['unreadCounts'],
    queryFn: getUnreadCounts,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

interface MarkAsReadOptions {
  id: string
  read: boolean
  /** Skip invalidating entries query (for lightbox to avoid list refresh during viewing) */
  skipInvalidate?: boolean
}

export function useMarkAsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, read }: MarkAsReadOptions) =>
      updateEntryReadStatus(id, read),

    // Optimistic update: immediately update UI before API call completes
    onMutate: async ({ id, read }) => {
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ['entry', id] })
      await queryClient.cancelQueries({ queryKey: ['entries'] })

      // Snapshot previous values for rollback
      const previousEntry = queryClient.getQueryData<Entry>(['entry', id])
      const previousEntries = queryClient.getQueriesData<{ pages: { entries: Entry[] }[] }>({
        queryKey: ['entries'],
      })

      // Optimistically update single entry cache
      queryClient.setQueryData(['entry', id], (old: Entry | undefined) => {
        if (!old) return old
        return { ...old, read }
      })

      // Optimistically update entries list cache
      queryClient.setQueriesData<{ pages: { entries: Entry[] }[] }>(
        { queryKey: ['entries'] },
        (old) => {
          if (!old) return old
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              entries: page.entries.map((entry) =>
                entry.id === id ? { ...entry, read } : entry
              ),
            })),
          }
        }
      )

      return { previousEntry, previousEntries }
    },

    onSuccess: (_, { skipInvalidate }) => {
      // Always update unread counts immediately
      queryClient.invalidateQueries({ queryKey: ['unreadCounts'] })
      // Only invalidate entries if not skipped (e.g., not in lightbox/detail view)
      if (!skipInvalidate) {
        queryClient.invalidateQueries({ queryKey: ['entries'] })
      }
    },

    onError: (_, { id }, context) => {
      // Rollback to previous values on error
      if (context?.previousEntry) {
        queryClient.setQueryData(['entry', id], context.previousEntry)
      }
      if (context?.previousEntries) {
        for (const [queryKey, data] of context.previousEntries) {
          queryClient.setQueryData(queryKey, data)
        }
      }
    },
  })
}

/** Remove specific entries from unreadOnly list cache (for delayed removal) */
export function useRemoveFromUnreadList() {
  const queryClient = useQueryClient()

  return useCallback(
    (idsToRemove: Set<string>) => {
      const queries = queryClient.getQueriesData<{ pages: { entries: Entry[]; hasMore: boolean }[] }>({
        queryKey: ['entries'],
      })

      for (const [queryKey, data] of queries) {
        // Only process unreadOnly queries
        const params = queryKey[1] as EntryListParams | undefined
        if (!params?.unreadOnly || !data) continue

        const updatedData = {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            entries: page.entries.filter((entry) => !idsToRemove.has(entry.id)),
          })),
        }

        queryClient.setQueryData(queryKey, updatedData)
      }
    },
    [queryClient]
  )
}

export function useMarkAllAsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: MarkAllReadParams) => markAllAsRead(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries'] })
      queryClient.invalidateQueries({ queryKey: ['unreadCounts'] })
    },
  })
}

export function useStarredCount() {
  return useQuery({
    queryKey: ['starredCount'],
    queryFn: getStarredCount,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

export function useMarkAsStarred() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, starred }: { id: string; starred: boolean }) =>
      updateEntryStarred(id, starred),
    onSuccess: (_, { id, starred }) => {
      queryClient.setQueryData(['entry', id], (old: Entry | undefined) => {
        if (!old) return old
        return { ...old, starred }
      })
      queryClient.invalidateQueries({ queryKey: ['starredCount'] })
      queryClient.invalidateQueries({ queryKey: ['entries'] })
    },
  })
}
