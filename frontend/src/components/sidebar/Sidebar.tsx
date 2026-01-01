import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarHeader } from './SidebarHeader'
import { StarredItem } from './StarredItem'
import { FeedCategory } from './FeedCategory'
import { FeedItem } from './FeedItem'
import { SettingsModal } from '@/components/settings'
import { useFolders, useDeleteFolder, useUpdateFolderType } from '@/hooks/useFolders'
import { useFeeds, useDeleteFeed, useUpdateFeed, useUpdateFeedType } from '@/hooks/useFeeds'
import { useUnreadCounts, useStarredCount } from '@/hooks/useEntries'
import type { SelectionType } from '@/hooks/useSelection'
import type { Folder, Feed, ContentType } from '@/types/api'

type SortBy = 'name' | 'date'

// ASCII first (English/numbers before Chinese)
function compareNames(a: string, b: string): number {
  const isAsciiA = /^[\u0000-\u007f]/.test(a)
  const isAsciiB = /^[\u0000-\u007f]/.test(b)
  if (isAsciiA && !isAsciiB) return -1
  if (!isAsciiA && isAsciiB) return 1
  return a.localeCompare(b, 'zh-CN')
}

function ArrowDownAZIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 8 4-4 4 4" />
      <path d="M7 4v16" />
      <path d="M11 12h4" />
      <path d="M11 16h7" />
      <path d="M11 20h10" />
    </svg>
  )
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
    </svg>
  )
}

interface SidebarProps {
  onAddClick?: (contentType: ContentType) => void
  selection: SelectionType
  onSelectFeed: (feedId: string) => void
  onSelectFolder: (folderId: string) => void
  onSelectStarred: () => void
}

interface FolderWithFeeds {
  folder: Folder
  feeds: Feed[]
}

function FileTextIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" x2="8" y1="13" y2="13" />
      <line x1="16" x2="8" y1="17" y2="17" />
      <line x1="10" x2="8" y1="9" y2="9" />
    </svg>
  )
}

function ImageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  )
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  )
}

export function Sidebar({
  onAddClick,
  selection,
  onSelectFeed,
  onSelectFolder,
  onSelectStarred,
}: SidebarProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [sortBy, setSortBy] = useState<SortBy>('name')
  const [contentType, setContentType] = useState<ContentType>('article')

  // Animation direction tracking
  const contentTypeList: ContentType[] = ['article', 'picture', 'notification']
  const orderIndex = contentTypeList.indexOf(contentType)
  const prevOrderIndexRef = useRef(-1)
  const [isReady, setIsReady] = useState(false)
  const [direction, setDirection] = useState<'left' | 'right'>('right')
  const [currentAnimatedType, setCurrentAnimatedType] = useState(contentType)

  useLayoutEffect(() => {
    const prevOrderIndex = prevOrderIndexRef.current
    if (prevOrderIndex !== orderIndex) {
      if (prevOrderIndex < orderIndex) setDirection('right')
      else setDirection('left')
    }
    setTimeout(() => setCurrentAnimatedType(contentType), 0)
    if (prevOrderIndexRef.current !== -1) setIsReady(true)
    prevOrderIndexRef.current = orderIndex
  }, [orderIndex, contentType])

  const { data: allFolders = [] } = useFolders()
  const { data: allFeeds = [] } = useFeeds()
  const { mutate: deleteFeed } = useDeleteFeed()
  const { mutate: deleteFolder } = useDeleteFolder()
  const { mutate: updateFeed } = useUpdateFeed()
  const { mutate: updateFeedType } = useUpdateFeedType()
  const { mutate: updateFolderType } = useUpdateFolderType()

  // Filter by content type (use currentAnimatedType for animation consistency)
  const folders = useMemo(
    () => allFolders.filter((f) => f.type === currentAnimatedType),
    [allFolders, currentAnimatedType]
  )
  const feeds = useMemo(
    () => allFeeds.filter((f) => f.type === currentAnimatedType),
    [allFeeds, currentAnimatedType]
  )

  const { data: unreadCountsData } = useUnreadCounts()
  const { data: starredCountData } = useStarredCount()

  // Handlers for menu actions
  const handleDeleteFeed = useCallback((feedId: string) => {
    deleteFeed(feedId)
  }, [deleteFeed])

  const handleDeleteFolder = useCallback((folderId: string) => {
    deleteFolder(folderId)
  }, [deleteFolder])

  const handleMoveToFolder = useCallback((feedId: string, folderId: string | null) => {
    const feed = allFeeds.find((f) => f.id === feedId)
    if (feed) {
      updateFeed({ id: feedId, title: feed.title, folderId: folderId ?? undefined })
    }
  }, [allFeeds, updateFeed])

  const handleChangeFeedType = useCallback((feedId: string, type: ContentType) => {
    updateFeedType({ id: feedId, type })
  }, [updateFeedType])

  const handleChangeFolderType = useCallback((folderId: string, type: ContentType) => {
    updateFolderType({ id: folderId, type })
  }, [updateFolderType])

  const unreadCounts = useMemo(() => {
    if (!unreadCountsData) return new Map<string, number>()
    const map = new Map<string, number>()
    for (const [key, value] of Object.entries(unreadCountsData.counts)) {
      map.set(key, value)
    }
    return map
  }, [unreadCountsData])

  // Calculate unread count for each content type
  const contentTypeCounts = useMemo(() => {
    const counts = { article: 0, picture: 0, notification: 0 }
    for (const feed of allFeeds) {
      counts[feed.type] += unreadCounts.get(feed.id) || 0
    }
    return counts
  }, [allFeeds, unreadCounts])

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

  const { foldersWithFeeds, uncategorizedFeeds } = groupFeedsByFolder(folders, feeds)

  // Sort feeds helper
  const sortFeeds = useCallback(
    (feedList: Feed[]) => {
      const sorted = [...feedList]
      if (sortBy === 'date') {
        sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      } else {
        sorted.sort((a, b) => compareNames(a.title, b.title))
      }
      return sorted
    },
    [sortBy]
  )

  // Sorted folders with feeds
  const sortedFoldersWithFeeds = useMemo(() => {
    const sorted = [...foldersWithFeeds]
    if (sortBy === 'date') {
      sorted.sort((a, b) => new Date(a.folder.createdAt).getTime() - new Date(b.folder.createdAt).getTime())
    } else {
      sorted.sort((a, b) => compareNames(a.folder.name, b.folder.name))
    }
    return sorted.map((item) => ({
      ...item,
      feeds: sortFeeds(item.feeds),
    }))
  }, [foldersWithFeeds, sortBy, sortFeeds])

  // Sorted uncategorized feeds
  const sortedUncategorizedFeeds = useMemo(() => sortFeeds(uncategorizedFeeds), [uncategorizedFeeds, sortFeeds])

  const isStarredSelected = selection.type === 'starred'
  const isFeedSelected = (feedId: string) =>
    selection.type === 'feed' && selection.feedId === feedId
  const isFolderSelected = (folderId: string) =>
    selection.type === 'folder' && selection.folderId === folderId

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <SidebarHeader onAddClick={() => onAddClick?.(contentType)} onSettingsClick={() => setIsSettingsOpen(true)} />

      {/* Content Type Switcher */}
      <div className="relative mb-2 mt-3">
        <div className="flex h-11 items-center px-1 text-xl text-muted-foreground">
          <button
            onClick={() => setContentType('article')}
            className={cn(
              'flex h-11 w-8 shrink-0 grow flex-col items-center justify-center gap-1 rounded-md transition-colors',
              contentType === 'article'
                ? 'text-lime-600 dark:text-lime-500'
                : 'text-muted-foreground hover:text-foreground'
            )}
            title="Articles"
          >
            <FileTextIcon className="size-[1.375rem]" />
            <div className="text-[0.625rem] font-medium leading-none">
              {contentTypeCounts.article}
            </div>
          </button>
          <button
            onClick={() => setContentType('picture')}
            className={cn(
              'flex h-11 w-8 shrink-0 grow flex-col items-center justify-center gap-1 rounded-md transition-colors',
              contentType === 'picture'
                ? 'text-lime-600 dark:text-lime-500'
                : 'text-muted-foreground hover:text-foreground'
            )}
            title="Pictures"
          >
            <ImageIcon className="size-[1.375rem]" />
            <div className="text-[0.625rem] font-medium leading-none">
              {contentTypeCounts.picture}
            </div>
          </button>
          <button
            onClick={() => setContentType('notification')}
            className={cn(
              'flex h-11 w-8 shrink-0 grow flex-col items-center justify-center gap-1 rounded-md transition-colors',
              contentType === 'notification'
                ? 'text-lime-600 dark:text-lime-500'
                : 'text-muted-foreground hover:text-foreground'
            )}
            title="Notifications"
          >
            <BellIcon className="size-[1.375rem]" />
            <div className="text-[0.625rem] font-medium leading-none">
              {contentTypeCounts.notification}
            </div>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="relative flex-1 overflow-hidden">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={currentAnimatedType}
            initial={isReady ? { x: direction === 'right' ? '100%' : '-100%' } : false}
            animate={{ x: 0 }}
            exit={{ x: direction === 'right' ? '-100%' : '100%' }}
            transition={{ type: 'spring', duration: 0.4, bounce: 0.15 }}
            className="absolute inset-0 overflow-y-auto px-1 py-2 space-y-1"
          >
            {/* Starred section */}
            <StarredItem
              isActive={isStarredSelected}
              count={starredCountData?.count ?? 0}
              onClick={onSelectStarred}
            />

            {/* Feed categories header with sort */}
            <div className="mt-3 flex items-center justify-between px-2.5">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                Feeds
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground">
                    {sortBy === 'name' ? <ArrowDownAZIcon className="size-3.5" /> : <CalendarIcon className="size-3.5" />}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setSortBy('name')} className={cn(sortBy === 'name' && 'bg-accent')}>
                    <ArrowDownAZIcon className="mr-2 size-4" />
                    Sort by Name
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortBy('date')} className={cn(sortBy === 'date' && 'bg-accent')}>
                    <CalendarIcon className="mr-2 size-4" />
                    Sort by Date
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Feed categories */}
            <div className="space-y-px">
              {sortedFoldersWithFeeds.map(({ folder, feeds: folderFeeds }) => (
                <FeedCategory
                  key={folder.id}
                  folderId={folder.id}
                  name={folder.name}
                  unreadCount={folderUnreadCounts.get(folder.id) || 0}
                  isSelected={isFolderSelected(folder.id)}
                  onSelect={() => onSelectFolder(folder.id)}
                  onDelete={handleDeleteFolder}
                  onChangeType={handleChangeFolderType}
                >
                  {folderFeeds.map((feed) => (
                    <FeedItem
                      key={feed.id}
                      feedId={feed.id}
                      name={feed.title}
                      iconPath={feed.iconPath}
                      unreadCount={unreadCounts.get(feed.id) || 0}
                      isActive={isFeedSelected(feed.id)}
                      errorMessage={feed.errorMessage}
                      onClick={() => onSelectFeed(feed.id)}
                      className="pl-6"
                      folders={folders}
                      onDelete={handleDeleteFeed}
                      onMoveToFolder={handleMoveToFolder}
                      onChangeType={handleChangeFeedType}
                    />
                  ))}
                </FeedCategory>
              ))}

              {sortedUncategorizedFeeds.map((feed) => (
                <FeedItem
                  key={feed.id}
                  feedId={feed.id}
                  name={feed.title}
                  iconPath={feed.iconPath}
                  unreadCount={unreadCounts.get(feed.id) || 0}
                  isActive={isFeedSelected(feed.id)}
                  errorMessage={feed.errorMessage}
                  onClick={() => onSelectFeed(feed.id)}
                  className="pl-2.5"
                  folders={folders}
                  onDelete={handleDeleteFeed}
                  onMoveToFolder={handleMoveToFolder}
                  onChangeType={handleChangeFeedType}
                />
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
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
