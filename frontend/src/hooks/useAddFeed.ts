import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createFeed, createFolder, listFolders, previewFeed } from '@/api'
import { getErrorMessage } from '@/lib/errors'
import type { ContentType, FeedPreview, Folder } from '@/types/api'

export interface SubscribeOptions {
  folderName?: string
  title?: string
}

interface UseAddFeedReturn {
  feedPreview: FeedPreview | null
  isLoading: boolean
  error: string | null
  discoverFeed: (url: string) => Promise<void>
  subscribeFeed: (feedUrl: string, options: SubscribeOptions) => Promise<boolean>
  clearPreview: () => void
  clearError: () => void
}

async function findOrCreateFolder(
  folderName: string,
  existingFolders: Folder[],
  contentType: ContentType
): Promise<string> {
  const existing = existingFolders.find(
    (folder) => folder.name.toLowerCase() === folderName.toLowerCase()
  )
  if (existing) {
    return existing.id
  }

  const created = await createFolder({ name: folderName, type: contentType })
  return created.id
}

export function useAddFeed(contentType: ContentType = 'article'): UseAddFeedReturn {
  const [feedPreview, setFeedPreview] = useState<FeedPreview | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const clearPreview = useCallback(() => {
    setFeedPreview(null)
  }, [])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const discoverFeed = useCallback(async (url: string) => {
    setIsLoading(true)
    setError(null)
    setFeedPreview(null)

    try {
      const data = await previewFeed(url)
      setFeedPreview(data)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to fetch feed. Please check the URL and try again.'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  const subscribeFeed = useCallback(async (feedUrl: string, options: SubscribeOptions): Promise<boolean> => {
    setIsLoading(true)
    setError(null)

    try {
      let folderId: string | undefined

      if (options.folderName) {
        const folders = await listFolders()
        folderId = await findOrCreateFolder(options.folderName, folders, contentType)
        await queryClient.invalidateQueries({ queryKey: ['folders'] })
      }

      await createFeed({
        url: feedUrl,
        folderId,
        title: options.title,
        type: contentType,
      })
      await queryClient.invalidateQueries({ queryKey: ['feeds'] })
      return true
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to subscribe to feed.'))
      return false
    } finally {
      setIsLoading(false)
    }
  }, [queryClient, contentType])

  return {
    feedPreview,
    isLoading,
    error,
    discoverFeed,
    subscribeFeed,
    clearPreview,
    clearError,
  }
}
