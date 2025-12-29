import { useMemo } from 'react'
import { SidebarHeader } from './SidebarHeader'
import { StarredItem } from './StarredItem'
import { FeedCategory } from './FeedCategory'
import { FeedItem } from './FeedItem'
import { useFolders } from '@/hooks/useFolders'
import { useFeeds } from '@/hooks/useFeeds'
import { useUnreadCounts } from '@/hooks/useEntries'
import type { SelectionType } from '@/hooks/useSelection'
import type { Folder, Feed } from '@/types/api'

interface SidebarProps {
  onAddClick?: () => void
  selection: SelectionType
  onSelectAll: () => void
  onSelectFeed: (feedId: number) => void
  onSelectFolder: (folderId: number) => void
}

interface FolderWithFeeds {
  folder: Folder
  feeds: Feed[]
}

export function Sidebar({
  onAddClick,
  selection,
  onSelectAll,
  onSelectFeed,
  onSelectFolder,
}: SidebarProps) {
  const { data: folders = [] } = useFolders()
  const { data: feeds = [] } = useFeeds()
  const { data: unreadCountsData } = useUnreadCounts()

  const unreadCounts = useMemo(() => {
    if (!unreadCountsData) return new Map<number, number>()
    const map = new Map<number, number>()
    for (const [key, value] of Object.entries(unreadCountsData.counts)) {
      map.set(Number(key), value)
    }
    return map
  }, [unreadCountsData])

  const folderUnreadCounts = useMemo(() => {
    const map = new Map<number, number>()
    for (const feed of feeds) {
      if (feed.folderId) {
        const current = map.get(feed.folderId) || 0
        const feedUnread = unreadCounts.get(feed.id) || 0
        map.set(feed.folderId, current + feedUnread)
      }
    }
    return map
  }, [feeds, unreadCounts])

  const totalUnread = useMemo(() => {
    let total = 0
    unreadCounts.forEach((count) => {
      total += count
    })
    return total
  }, [unreadCounts])

  const { foldersWithFeeds, uncategorizedFeeds } = groupFeedsByFolder(folders, feeds)

  const isAllSelected = selection.type === 'all'
  const isFeedSelected = (feedId: number) =>
    selection.type === 'feed' && selection.feedId === feedId
  const isFolderSelected = (folderId: number) =>
    selection.type === 'folder' && selection.folderId === folderId

  return (
    <div className="flex h-full flex-col">
      <SidebarHeader onAddClick={onAddClick} />

      <div className="flex-1 overflow-auto px-1">
        {/* All Articles */}
        <div
          className={`flex h-8 cursor-pointer items-center rounded-md px-2 text-sm transition-colors ${
            isAllSelected
              ? 'bg-accent text-accent-foreground'
              : 'hover:bg-accent/50'
          }`}
          onClick={onSelectAll}
        >
          <svg
            className="mr-2 size-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
            />
          </svg>
          <span className="flex-1">All Articles</span>
          {totalUnread > 0 && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {totalUnread}
            </span>
          )}
        </div>

        {/* Starred section */}
        <StarredItem />

        {/* Feed categories */}
        <div className="mt-2 space-y-px">
          {foldersWithFeeds.map(({ folder, feeds: folderFeeds }) => (
            <FeedCategory
              key={folder.id}
              name={folder.name}
              unreadCount={folderUnreadCounts.get(folder.id) || 0}
              isSelected={isFolderSelected(folder.id)}
              onSelect={() => onSelectFolder(folder.id)}
            >
              {folderFeeds.map((feed) => (
                <FeedItem
                  key={feed.id}
                  name={feed.title}
                  unreadCount={unreadCounts.get(feed.id) || 0}
                  isActive={isFeedSelected(feed.id)}
                  onClick={() => onSelectFeed(feed.id)}
                />
              ))}
            </FeedCategory>
          ))}

          {uncategorizedFeeds.length > 0 && (
            <FeedCategory
              name="Uncategorized"
              unreadCount={uncategorizedFeeds.reduce(
                (sum, feed) => sum + (unreadCounts.get(feed.id) || 0),
                0
              )}
            >
              {uncategorizedFeeds.map((feed) => (
                <FeedItem
                  key={feed.id}
                  name={feed.title}
                  unreadCount={unreadCounts.get(feed.id) || 0}
                  isActive={isFeedSelected(feed.id)}
                  onClick={() => onSelectFeed(feed.id)}
                />
              ))}
            </FeedCategory>
          )}
        </div>
      </div>
    </div>
  )
}

function groupFeedsByFolder(
  folders: Folder[],
  feeds: Feed[]
): {
  foldersWithFeeds: FolderWithFeeds[]
  uncategorizedFeeds: Feed[]
} {
  const folderMap = new Map<number, Feed[]>()

  for (const folder of folders) {
    folderMap.set(folder.id, [])
  }

  const uncategorizedFeeds: Feed[] = []

  for (const feed of feeds) {
    if (feed.folderId !== null && feed.folderId !== undefined) {
      const folderFeeds = folderMap.get(feed.folderId)
      if (folderFeeds) {
        folderFeeds.push(feed)
      } else {
        uncategorizedFeeds.push(feed)
      }
    } else {
      uncategorizedFeeds.push(feed)
    }
  }

  const foldersWithFeeds: FolderWithFeeds[] = folders.map((folder) => ({
    folder,
    feeds: folderMap.get(folder.id) || [],
  }))

  return { foldersWithFeeds, uncategorizedFeeds }
}
