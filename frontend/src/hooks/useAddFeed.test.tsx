import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAddFeed } from './useAddFeed'
import * as api from '@/api'
import type { Folder } from '@/types/api'

// Mock i18n
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

// Mock API functions
vi.mock('@/api', () => ({
  ApiError: class ApiError extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  },
  createFeed: vi.fn(),
  createFolder: vi.fn(),
  listFolders: vi.fn(),
  previewFeed: vi.fn(),
}))

describe('useAddFeed', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    vi.clearAllMocks()
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  describe('subscribeFeed - cross-view folder selection', () => {
    it('should use folder type when subscribing to existing folder', async () => {
      const mockFolders: Folder[] = [
        { id: '1', name: 'Tech', type: 'article', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
        { id: '2', name: 'Photos', type: 'picture', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
      ]

      vi.mocked(api.listFolders).mockResolvedValue(mockFolders)
      vi.mocked(api.createFeed).mockResolvedValue({
        id: '123',
        url: 'https://example.com/feed',
        title: 'Test Feed',
        type: 'article',
        folderId: '1',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      })

      // User is in picture view but selects an article folder
      const { result } = renderHook(() => useAddFeed('picture'), { wrapper })

      await waitFor(() => {
        expect(result.current).toBeDefined()
      })

      // Subscribe with article folder selected
      let success: boolean = false
      await act(async () => {
        success = await result.current.subscribeFeed('https://example.com/feed', {
          folderName: 'Tech',
          targetFolderType: 'article',
        })
      })

      expect(success).toBe(true)
      expect(api.createFeed).toHaveBeenCalledWith({
        url: 'https://example.com/feed',
        folderId: '1',
        title: undefined,
        type: 'article', // Should follow folder type, not view type
      })
    })

    it('should create new folder with target type when folder does not exist', async () => {
      const mockFolders: Folder[] = [
        { id: '1', name: 'Existing', type: 'article', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
      ]

      vi.mocked(api.listFolders).mockResolvedValue(mockFolders)
      vi.mocked(api.createFolder).mockResolvedValue({
        id: '2',
        name: 'NewFolder',
        type: 'picture',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      })
      vi.mocked(api.createFeed).mockResolvedValue({
        id: '123',
        url: 'https://example.com/feed',
        title: 'Test Feed',
        type: 'picture',
        folderId: '2',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      })

      const { result } = renderHook(() => useAddFeed('article'), { wrapper })

      await waitFor(() => {
        expect(result.current).toBeDefined()
      })

      // Create new folder with picture type
      let success: boolean = false
      await act(async () => {
        success = await result.current.subscribeFeed('https://example.com/feed', {
          folderName: 'NewFolder',
          targetFolderType: 'picture',
        })
      })

      expect(success).toBe(true)
      expect(api.createFolder).toHaveBeenCalledWith({
        name: 'NewFolder',
        type: 'picture',
      })
      expect(api.createFeed).toHaveBeenCalledWith({
        url: 'https://example.com/feed',
        folderId: '2',
        title: undefined,
        type: 'picture',
      })
    })

    it('should use default contentType when no folder is selected', async () => {
      vi.mocked(api.createFeed).mockResolvedValue({
        id: '123',
        url: 'https://example.com/feed',
        title: 'Test Feed',
        type: 'notification',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      })

      const { result } = renderHook(() => useAddFeed('notification'), { wrapper })

      await waitFor(() => {
        expect(result.current).toBeDefined()
      })

      // Subscribe without folder
      let success: boolean = false
      await act(async () => {
        success = await result.current.subscribeFeed('https://example.com/feed', {})
      })

      expect(success).toBe(true)
      expect(api.createFeed).toHaveBeenCalledWith({
        url: 'https://example.com/feed',
        folderId: undefined,
        title: undefined,
        type: 'notification', // Should use default contentType
      })
    })

    it('should handle API errors gracefully', async () => {
      const mockFolders: Folder[] = [
        { id: '1', name: 'Tech', type: 'article', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
      ]

      vi.mocked(api.listFolders).mockResolvedValue(mockFolders)
      vi.mocked(api.createFeed).mockRejectedValue(new Error('API Error'))

      const { result } = renderHook(() => useAddFeed('article'), { wrapper })

      await waitFor(() => {
        expect(result.current).toBeDefined()
      })

      let success: boolean = false
      await act(async () => {
        success = await result.current.subscribeFeed('https://example.com/feed', {
          folderName: 'Tech',
          targetFolderType: 'article',
        })
      })

      expect(success).toBe(false)
      
      // Wait for error state to be updated
      await waitFor(() => {
        expect(result.current.error).toBeTruthy()
      })
    })
  })
})
