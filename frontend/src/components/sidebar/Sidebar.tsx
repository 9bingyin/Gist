import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ArrowDownAZIcon, CalendarIcon } from '@/components/ui/icons'
import { SidebarHeader } from './SidebarHeader'
import { FeedCategory } from './FeedCategory'
import { FeedItem } from './FeedItem'
import { ContentTypeSwitcher } from './ContentTypeSwitcher'
import { SettingsModal, ProfileModal } from '@/components/settings'
import { EditFeedDialog } from '@/components/settings/tabs/EditFeedDialog'
import { useFolders, useDeleteFolder, useUpdateFolderType } from '@/hooks/useFolders'
import { useFeeds, useDeleteFeed, useUpdateFeed, useUpdateFeedType } from '@/hooks/useFeeds'
import { useUnreadCounts } from '@/hooks/useEntries'
import { useAuth } from '@/hooks/useAuth'
import type { SelectionType } from '@/hooks/useSelection'
import type { Folder, Feed, ContentType } from '@/types/api'
import type { AppearanceSettings } from '@/types/settings'

const defaultContentTypes: ContentType[] = ['article', 'picture', 'notification']

// Per-contentType scroll position cache (module-level to survive unmount/remount)
const sidebarScrollPositions = new Map<string, number>()

type SortBy = 'name' | 'date'

// ASCII first (English/numbers before Chinese)
function compareNames(a: string, b: string): number {
  /* eslint-disable no-control-regex */
  const isAsciiA = /^[\u0000-\u007f]/.test(a)
  const isAsciiB = /^[\u0000-\u007f]/.test(b)
  /* eslint-enable no-control-regex */
  if (isAsciiA && !isAsciiB) return -1
  if (!isAsciiA && isAsciiB) return 1
  return a.localeCompare(b, 'zh-CN')
}

interface SidebarProps {
  onAddClick?: (contentType: ContentType) => void
  selection: SelectionType
  onSelectFeed: (feedId: string) => void
  onSelectFolder: (folderId: string) => void
  onSelectStarred: () => void
  onSelectAll?: (contentType?: ContentType) => void
  contentType: ContentType
  appearanceSettings?: AppearanceSettings
}

interface FolderWithFeeds {
  folder: Folder
  feeds: Feed[]
}

export function Sidebar({
  onAddClick,
  selection,
  onSelectFeed,
  onSelectFolder,
  onSelectStarred,
  onSelectAll,
  contentType,
  appearanceSettings,
}: SidebarProps) {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [editingFeed, setEditingFeed] = useState<Feed | null>(null)
  const [sortBy, setSortBy] = useState<SortBy>('name')

  const visibleContentTypes = useMemo(() => {
    const current = appearanceSettings?.contentTypes
    if (!current || current.length === 0) return defaultContentTypes
    return current.filter((type) => type === 'article' || type === 'picture' || type === 'notification')
  }, [appearanceSettings])

  // Animation direction tracking:
  // 1. direction is a state (set synchronously in effect, BEFORE setTimeout)
  // 2. prevOrderIndexRef tracks contentType's orderIndex (not animatedContentType)
  // 3. animatedContentType update is delayed via setTimeout
  const orderIndex = visibleContentTypes.indexOf(contentType)
  const prevOrderIndexRef = useRef(-1)
  const [isAnimationReady, setIsAnimationReady] = useState(false)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [animatedContentType, setAnimatedContentType] = useState(contentType)

  useLayoutEffect(() => {
    const prevOrderIndex = prevOrderIndexRef.current
    if (prevOrderIndex !== orderIndex && prevOrderIndex !== -1) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: must set direction BEFORE setTimeout schedules key update
      setDirection(orderIndex > prevOrderIndex ? 1 : -1)
    }
    setTimeout(() => {
      setAnimatedContentType(contentType)
    }, 0)
    if (prevOrderIndexRef.current !== -1) {
      setIsAnimationReady(true)
    }
    prevOrderIndexRef.current = orderIndex
  }, [orderIndex, contentType])

  const { data: allFolders = [] } = useFolders()
  const { data: allFeeds = [] } = useFeeds()
  const { mutate: deleteFeed } = useDeleteFeed()
  const { mutate: deleteFolder } = useDeleteFolder()
  const { mutate: updateFeed } = useUpdateFeed()
  const { mutate: updateFeedType } = useUpdateFeedType()
  const { mutate: updateFolderType } = useUpdateFolderType()

  // Filter by content type - use animatedContentType to keep content in sync with animation
  const folders = useMemo(
    () => allFolders.filter((f) => f.type === animatedContentType),
    [allFolders, animatedContentType]
  )
  const feeds = useMemo(
    () => allFeeds.filter((f) => f.type === animatedContentType),
    [allFeeds, animatedContentType]
  )

  const { data: unreadCountsData } = useUnreadCounts()

  // Handlers for menu actions
  const handleEditFeed = useCallback((feedId: string) => {
    const feed = allFeeds.find((f) => f.id === feedId)
    if (feed) setEditingFeed(feed)
  }, [allFeeds])

  const handleDeleteFeed = useCallback((feedId: string) => {
    deleteFeed(feedId)
  }, [deleteFeed])

  const handleDeleteFolder = useCallback((folderId: string) => {
    deleteFolder(folderId)
  }, [deleteFolder])

  const handleMoveToFolder = useCallback((feedId: string, folderId: string | null) => {
    const feed = allFeeds.find((f) => f.id === feedId)
    if (!feed) return

    if (folderId !== null) {
      const folder = folders.find((f) => f.id === folderId)
      if (!folder || folder.type !== feed.type) {
        return
      }
    }

    updateFeed({ id: feedId, title: feed.title, folderId: folderId ?? undefined })
  }, [allFeeds, folders, updateFeed])

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
    for (const type of Object.keys(counts) as ContentType[]) {
      if (!visibleContentTypes.includes(type)) {
        counts[type] = 0
      }
    }
    return counts
  }, [allFeeds, unreadCounts, visibleContentTypes])

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

  // Group feeds by folder (uses animatedContentType for content sync with animation)
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
      <SidebarHeader
        avatarUrl={user?.avatarUrl}
        userName={user?.nickname || user?.username}
        onAddClick={() => onAddClick?.(contentType)}
        isStarredSelected={isStarredSelected}
        onStarredClick={onSelectStarred}
        onProfileClick={() => setIsProfileOpen(true)}
        onSettingsClick={() => setIsSettingsOpen(true)}
        onLogoutClick={logout}
      />

      <ContentTypeSwitcher
        contentType={contentType}
        counts={contentTypeCounts}
        onSelect={(type) => onSelectAll?.(type)}
        visibleContentTypes={visibleContentTypes}
      />

      {/* Content */}
      <div className="relative flex-1 overflow-hidden">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            key={animatedContentType}
            initial={isAnimationReady ? { x: direction > 0 ? '100%' : '-100%', opacity: 0 } : false}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: direction > 0 ? '-100%' : '100%', opacity: 0 }}
            transition={{
              x: { type: 'spring', stiffness: 300, damping: 30 },
              opacity: { duration: 0.2 },
            }}
            className="absolute inset-0 will-change-[transform,opacity]"
          >
            <SidebarScrollArea scrollKey={animatedContentType}>
              {/* Feed categories header with sort */}
              <div className="flex items-center justify-between px-2.5">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                  {t('sidebar.feeds')}
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
                      {t('sidebar.sort_name')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSortBy('date')} className={cn(sortBy === 'date' && 'bg-accent')}>
                      <CalendarIcon className="mr-2 size-4" />
                      {t('sidebar.sort_date')}
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
                        onEdit={handleEditFeed}
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
                    onEdit={handleEditFeed}
                    onDelete={handleDeleteFeed}
                    onMoveToFolder={handleMoveToFolder}
                    onChangeType={handleChangeFeedType}
                  />
                ))}
              </div>
            </SidebarScrollArea>
          </motion.div>
        </AnimatePresence>
      </div>

      <SettingsModal open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
      <ProfileModal open={isProfileOpen} onOpenChange={setIsProfileOpen} />
      <EditFeedDialog
        feed={editingFeed}
        open={editingFeed !== null}
        onOpenChange={(open) => { if (!open) setEditingFeed(null) }}
      />
    </div>
  )
}

// Isolated scroll container - each AnimatePresence keyed child creates its own instance,
// so refs and effects never conflict between entering/exiting elements.
function SidebarScrollArea({ scrollKey, children }: { scrollKey: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    // Restore saved position
    const saved = sidebarScrollPositions.get(scrollKey)
    if (saved) {
      node.scrollTop = saved
    }

    // Save on scroll
    const handleScroll = () => {
      sidebarScrollPositions.set(scrollKey, node.scrollTop)
    }

    node.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      node.removeEventListener('scroll', handleScroll)
    }
  }, [scrollKey])

  return (
    <div
      ref={ref}
      className="h-full overflow-y-auto px-1 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] space-y-1"
    >
      {children}
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
