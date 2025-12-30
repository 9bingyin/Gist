import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { SidebarHeader } from './SidebarHeader'
import { StarredItem } from './StarredItem'
import { FeedCategory } from './FeedCategory'
import { FeedItem } from './FeedItem'
import { SettingsModal } from '@/components/settings'
import { useFolders } from '@/hooks/useFolders'
import { useFeeds } from '@/hooks/useFeeds'
import { useUnreadCounts, useStarredCount } from '@/hooks/useEntries'
import { feedItemStyles, sidebarItemIconStyles } from './styles'
import type { SelectionType } from '@/hooks/useSelection'
import type { Folder, Feed } from '@/types/api'

interface SidebarProps {
  onAddClick?: () => void
  selection: SelectionType
  onSelectAll: () => void
  onSelectFeed: (feedId: string) => void
  onSelectFolder: (folderId: string) => void
  onSelectStarred: () => void
}

interface FolderWithFeeds {
  folder: Folder
  feeds: Feed[]
}

function ArticlesIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
    </svg>
  )
}

export function Sidebar({
  onAddClick,
  selection,
  onSelectAll,
  onSelectFeed,
  onSelectFolder,
  onSelectStarred,
}: SidebarProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  const { data: folders = [] } = useFolders()
  const { data: feeds = [] } = useFeeds()
  const { data: unreadCountsData } = useUnreadCounts()
  const { data: starredCountData } = useStarredCount()

  const unreadCounts = useMemo(() => {
    if (!unreadCountsData) return new Map<string, number>()
    const map = new Map<string, number>()
    for (const [key, value] of Object.entries(unreadCountsData.counts)) {
      map.set(key, value)
    }
    return map
  }, [unreadCountsData])

  const folderUnreadCounts = useMemo(() => {
    const map = new Map<string, number>()
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
  const isStarredSelected = selection.type === 'starred'
  const isFeedSelected = (feedId: string) =>
    selection.type === 'feed' && selection.feedId === feedId
  const isFolderSelected = (folderId: string) =>
    selection.type === 'folder' && selection.folderId === folderId

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <SidebarHeader onAddClick={onAddClick} onSettingsClick={() => setIsSettingsOpen(true)} />

      <div className="flex-1 overflow-auto px-1">
        {/* All Articles */}
        <div
          data-active={isAllSelected}
          className={cn(feedItemStyles, 'mt-1 pl-2.5')}
          onClick={onSelectAll}
        >
          <span className={sidebarItemIconStyles}>
            <ArticlesIcon className="size-4" />
          </span>
          <span className="grow">All Articles</span>
          {totalUnread > 0 && (
            <span className="text-[0.65rem] tabular-nums text-muted-foreground">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
        </div>

        {/* Starred section */}
        <StarredItem
          isActive={isStarredSelected}
          count={starredCountData?.count ?? 0}
          onClick={onSelectStarred}
        />

        {/* Feed categories */}
        <div className="mt-3 space-y-px">
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
                  iconPath={feed.iconPath}
                  unreadCount={unreadCounts.get(feed.id) || 0}
                  isActive={isFeedSelected(feed.id)}
                  onClick={() => onSelectFeed(feed.id)}
                  className="pl-6"
                />
              ))}
            </FeedCategory>
          ))}

          {uncategorizedFeeds.map((feed) => (
            <FeedItem
              key={feed.id}
              name={feed.title}
              iconPath={feed.iconPath}
              unreadCount={unreadCounts.get(feed.id) || 0}
              isActive={isFeedSelected(feed.id)}
              onClick={() => onSelectFeed(feed.id)}
              className="pl-2.5"
            />
          ))}
        </div>
      </div>

      <SettingsModal open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
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
  const folderMap = new Map<string, Feed[]>()

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
