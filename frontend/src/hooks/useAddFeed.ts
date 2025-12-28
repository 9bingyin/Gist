import { useState, useCallback } from 'react'

export interface FeedPreview {
  url: string
  title: string
  description?: string
  siteUrl?: string
  imageUrl?: string
  itemCount?: number
  lastUpdated?: string
}

export interface SubscribeOptions {
  category?: string
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

export function useAddFeed(): UseAddFeedReturn {
  const [feedPreview, setFeedPreview] = useState<FeedPreview | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      // TODO: Replace with actual API call
      // const response = await fetch(`/api/feeds/preview?url=${encodeURIComponent(url)}`)
      // if (!response.ok) {
      //   throw new Error('Failed to fetch feed')
      // }
      // const data: FeedPreview = await response.json()
      // setFeedPreview(data)

      // Mock data for now
      await new Promise(resolve => setTimeout(resolve, 800))

      let siteUrl: string | undefined
      try {
        siteUrl = new URL(url).origin
      } catch {
        // Invalid URL, leave siteUrl undefined
      }

      setFeedPreview({
        url,
        title: 'Discovered Feed',
        description: 'This is a preview of the RSS feed. The actual content will be fetched from the server.',
        siteUrl,
        itemCount: 42,
        lastUpdated: new Date().toISOString(),
      })
    } catch {
      setError('Failed to fetch feed. Please check the URL and try again.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const subscribeFeed = useCallback(async (_feedUrl: string, _options: SubscribeOptions): Promise<boolean> => {
    setIsLoading(true)
    setError(null)

    try {
      // TODO: Replace with actual API call
      // const response = await fetch('/api/feeds/subscribe', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ url: feedUrl, ...options }),
      // })
      // if (!response.ok) {
      //   throw new Error('Failed to subscribe')
      // }

      await new Promise(resolve => setTimeout(resolve, 500))
      return true
    } catch {
      setError('Failed to subscribe to feed.')
      return false
    } finally {
      setIsLoading(false)
    }
  }, [])

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
