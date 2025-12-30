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

export function useMarkAsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, read }: { id: string; read: boolean }) =>
      updateEntryReadStatus(id, read),
    onSuccess: (_, { id, read }) => {
      queryClient.setQueryData(['entry', id], (old: Entry | undefined) => {
        if (!old) return old
        return { ...old, read }
      })
      queryClient.invalidateQueries({ queryKey: ['unreadCounts'] })
      queryClient.invalidateQueries({ queryKey: ['entries'] })
    },
  })
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
