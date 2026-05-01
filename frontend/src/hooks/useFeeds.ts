import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listFeeds, deleteFeed, updateFeed, updateFeedType, updateFeedViewMode } from '@/api'
import type { ContentType, FeedViewMode } from '@/types/api'
import { feedViewActions } from '@/stores/feed-view-store'

export function useFeeds() {
  const query = useQuery({
    queryKey: ['feeds'],
    queryFn: () => listFeeds(),
  })

  useEffect(() => {
    if (!query.data) return
    feedViewActions.syncModesFromFeeds(query.data)
  }, [query.data])

  return query
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
    mutationFn: (payload: {
      id: string
      title: string
      folderId?: string
      summaryPromptReminder?: string
    }) =>
      updateFeed(payload.id, {
        title: payload.title,
        folderId: payload.folderId,
        summaryPromptReminder: payload.summaryPromptReminder,
      }),
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

export function useUpdateFeedViewMode() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: { id: string; viewMode?: FeedViewMode }) =>
      updateFeedViewMode(payload.id, payload.viewMode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feeds'] })
    },
  })
}
