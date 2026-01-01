import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listFeeds, deleteFeed, updateFeed, updateFeedType } from '@/api'
import type { ContentType } from '@/types/api'

export function useFeeds() {
  return useQuery({
    queryKey: ['feeds'],
    queryFn: () => listFeeds(),
  })
}

export function useDeleteFeed() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteFeed(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feeds'] })
      queryClient.invalidateQueries({ queryKey: ['unreadCounts'] })
    },
  })
}

export function useUpdateFeed() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: { id: string; title: string; folderId?: string }) =>
      updateFeed(payload.id, { title: payload.title, folderId: payload.folderId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feeds'] })
    },
  })
}

export function useUpdateFeedType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: { id: string; type: ContentType }) =>
      updateFeedType(payload.id, payload.type),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feeds'] })
    },
  })
}
