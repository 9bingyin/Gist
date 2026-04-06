import { Suspense, lazy, useCallback, useState, useMemo, useEffect, useLayoutEffect, useRef } from 'react'
import { Router, useLocation, Redirect } from 'wouter'
import { useTranslation } from 'react-i18next'
import { ThreeColumnLayout } from '@/components/layout/three-column-layout'
import { Sheet } from '@/components/ui/sheet'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Sidebar } from '@/components/sidebar'
import { AddFeedPage } from '@/components/add-feed'
import { EntryList } from '@/components/entry-list'
import { PictureMasonry, Lightbox } from '@/components/picture-masonry'
import { ScrollToTopZone } from '@/components/layout/ScrollToTopZone'
import { ImagePreview } from '@/components/ui/image-preview'
import { LoginPage, RegisterPage, NetworkErrorPage } from '@/components/auth'
import { UpdateNotice } from '@/components/update-notice'
import { useSelection, selectionToParams } from '@/hooks/useSelection'
import { useMarkAllAsRead, useUnreadCounts, useEntry } from '@/hooks/useEntries'
import { useMobileLayout } from '@/hooks/useMobileLayout'
import { useAuth } from '@/hooks/useAuth'
import { useFeeds } from '@/hooks/useFeeds'
import { useFolders } from '@/hooks/useFolders'
import { useAppearanceSettings } from '@/hooks/useAppearanceSettings'
import { useTitle, buildTitle } from '@/hooks/useTitle'
import { useUISettingKey, useUISettingActions, hasSidebarVisibilitySetting, setUISetting } from '@/hooks/useUISettings'
import { useRefreshStatus } from '@/hooks/useRefreshStatus'
import { getEntryScrollPosition } from '@/hooks/useEntryContentScroll'
import { isAddFeedPath } from '@/lib/router'
import { cn } from '@/lib/utils'

import type { ContentType, Feed, Folder } from '@/types/api'

const defaultContentTypes: ContentType[] = ['article', 'picture', 'notification']
const LazyEntryContent = lazy(async () => {
  const module = await import('@/components/entry-content')
  return { default: module.EntryContent }
})

function LoadingScreen() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">{t('entry.loading')}</p>
      </div>
    </div>
  )
}

function AppBootstrapShell() {
  return (
    <div className="flex h-dvh flex-col bg-background lg:flex-row">
      <aside className="hidden w-72 shrink-0 border-r border-border/60 bg-muted/20 px-5 py-6 lg:flex lg:flex-col">
        <div className="h-8 w-28 rounded-full bg-muted" />
        <div className="mt-8 space-y-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="h-10 rounded-xl bg-muted/80" />
          ))}
        </div>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1">
        <section className="flex min-w-0 flex-1 flex-col border-r border-border/60 lg:max-w-md">
          <div className="border-b border-border/60 px-4 py-4 sm:px-6">
            <div className="h-6 w-40 rounded bg-muted" />
          </div>
          <div className="flex-1 space-y-px overflow-hidden px-2 py-2">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="rounded-2xl px-3 py-4">
                <div className="h-3 w-24 rounded bg-muted" />
                <div className="mt-3 h-4 w-5/6 rounded bg-muted" />
                <div className="mt-2 h-3 w-full rounded bg-muted/80" />
                <div className="mt-2 h-3 w-2/3 rounded bg-muted/80" />
              </div>
            ))}
          </div>
        </section>
        <section className="hidden min-w-0 flex-1 px-6 py-10 lg:block">
          <div className="mx-auto max-w-3xl space-y-5">
            <div className="h-10 w-3/4 rounded bg-muted" />
            <div className="flex gap-4">
              <div className="h-4 w-24 rounded bg-muted" />
              <div className="h-4 w-32 rounded bg-muted" />
            </div>
            <div className="h-px w-full bg-border/60" />
            {Array.from({ length: 8 }, (_, index) => (
              <div
                key={index}
                className={`h-4 rounded bg-muted/80 ${index % 3 === 2 ? 'w-4/5' : 'w-full'}`}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function EntryContentPlaceholder({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 items-center px-6" />
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center text-muted-foreground">
          <svg
            className="mx-auto size-12 opacity-50"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p className="mt-2 text-sm">{message}</p>
        </div>
      </div>
    </div>
  )
}

function EntryContentFallback() {
  return (
    <div className="relative flex h-full flex-col animate-pulse">
      <div className="absolute inset-x-0 top-0 z-20">
        <div className="h-12" />
      </div>
      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-[720px] px-6 pb-20 pt-16">
          <div className="mb-10 space-y-5">
            <div className="h-10 w-3/4 rounded bg-muted" />
            <div className="flex gap-6">
              <div className="h-4 w-24 rounded bg-muted" />
              <div className="h-4 w-32 rounded bg-muted" />
            </div>
            <hr className="border-border/60" />
          </div>
          <div className="space-y-4">
            <div className="h-4 w-full rounded bg-muted" />
            <div className="h-4 w-full rounded bg-muted" />
            <div className="h-4 w-3/4 rounded bg-muted" />
            <div className="h-4 w-full rounded bg-muted" />
            <div className="h-4 w-5/6 rounded bg-muted" />
          </div>
        </div>
      </div>
    </div>
  )
}

function AuthenticatedApp() {
  const [location, navigate] = useLocation()
  const {
    isMobile,
    isTablet,
    mobileView,
    sidebarOpen,
    setSidebarOpen,
    showList,
    openSidebar,
    closeSidebar,
  } = useMobileLayout()

  // Mobile detail view transition: controls whether the detail panel is mounted
  // and whether it is animating out (exiting). The detail renders in document flow
  // (not inside a fixed/overflow-hidden container) so that window is the scroll
  // container, which is required for mobile browsers to auto-hide the address bar.
  const [mobileDetailOpen, setMobileDetailOpen] = useState(mobileView === 'detail')
  const prevMobileViewRef = useRef(mobileView)
  // Ref so the useLayoutEffect below can read the latest selectedEntryId without
  // needing it in its deps (selectedEntryId is declared after this effect).
  const selectedEntryIdRef = useRef<string | null>(null)
  // useLayoutEffect to apply list/detail visibility synchronously before the browser
  // paints, eliminating the flash of blank content during transitions.
  useLayoutEffect(() => {
    const prev = prevMobileViewRef.current
    prevMobileViewRef.current = mobileView
    if (mobileView === 'detail') {
      setMobileDetailOpen(true)
      // Do NOT scrollTo here — the detail div is still display:none at this
      // point, so the document has no height and window.scrollTo would fail.
      // Scroll restore happens in the mobileDetailOpen effect below.
    } else if (prev === 'detail') {
      // Immediately show list so it is visible while the detail slides out.
      // Scroll restoration is handled by EntryList's useLayoutEffect (isActive → true).
      setMobileDetailOpen(false)
    }
  }, [mobileView])

  // Restore (or reset) window scroll AFTER the detail div becomes visible.
  // setMobileDetailOpen(true) triggers a synchronous re-render; this effect
  // fires on that second render when the detail div is block and has height.
  useLayoutEffect(() => {
    if (!mobileDetailOpen) return
    const id = selectedEntryIdRef.current
    const saved = id ? getEntryScrollPosition(id) : undefined
    if (saved != null && saved > 0) {
      window.scrollTo(0, saved)
    } else {
      window.scrollTo(0, 0)
    }
  }, [mobileDetailOpen])

  const {
    selection,
    selectAll,
    selectFeed,
    selectFolder,
    selectStarred,
    selectedEntryId,
    selectEntry,
    unreadOnly,
    toggleUnreadOnly,
    contentType,
  } = useSelection()

  // Keep ref in sync so the mobileView useLayoutEffect can read it
  selectedEntryIdRef.current = selectedEntryId

  const { mutate: markAllAsRead } = useMarkAllAsRead()
  const [addFeedContentType, setAddFeedContentType] = useState<ContentType>('article')

  // Poll refresh status and auto-invalidate entries when scheduled refresh completes
  useRefreshStatus()

  // Sidebar visibility for tablet/desktop
  const sidebarVisible = useUISettingKey('sidebarVisible')
  const { toggleSidebarVisible } = useUISettingActions()

  // Initialize sidebar visibility for tablet on first visit
  useEffect(() => {
    // Only run on tablet, and only if sidebarVisible has never been set
    if (isTablet && !hasSidebarVisibilitySetting()) {
      setUISetting('sidebarVisible', false)
    }
  }, [isTablet])

  // Calculate whether to show sidebar based on breakpoint
  // Desktop (>= 1366): always show
  // Tablet (768-1366): user preference (default false on first visit)
  // Mobile (< 768): use Sheet overlay
  const showSidebar = useMemo(() => {
    if (isMobile) return false // Mobile uses Sheet
    if (isTablet) return sidebarVisible // Tablet respects user preference
    return true // Desktop always shows sidebar
  }, [isMobile, isTablet, sidebarVisible])

  // Dynamic title management
  const { t } = useTranslation()
  const { data: feeds = [] } = useFeeds()
  const { data: folders = [] } = useFolders()
  const { data: appearanceSettings, isLoading: isAppearanceLoading } = useAppearanceSettings()
  const { data: entry } = useEntry(selectedEntryId)
  const { data: unreadCounts } = useUnreadCounts()

  const feedsMap = useMemo(() => {
    const map = new Map<string, Feed>()
    for (const feed of feeds) {
      map.set(feed.id, feed)
    }
    return map
  }, [feeds])

  const foldersMap = useMemo(() => {
    const map = new Map<string, Folder>()
    for (const folder of folders) {
      map.set(folder.id, folder)
    }
    return map
  }, [folders])

  const title = buildTitle({
    selection,
    contentType,
    entryTitle: entry?.title,
    feedsMap,
    foldersMap,
    t,
  })

  useTitle(title)

  // Mobile-aware selection handlers (all hooks must be before any conditional returns)
  // Use replace to avoid creating history entries for sidebar navigation
  const handleSelectFeed = useCallback((feedId: string) => {
    closeSidebar()
    selectFeed(feedId, { replace: true })
  }, [selectFeed, closeSidebar])

  const handleSelectFolder = useCallback((folderId: string) => {
    closeSidebar()
    selectFolder(folderId, { replace: true })
  }, [selectFolder, closeSidebar])

  const handleSelectStarred = useCallback(() => {
    closeSidebar()
    selectStarred({ replace: true })
  }, [selectStarred, closeSidebar])

  const handleAddClick = useCallback((ct: ContentType) => {
    setAddFeedContentType(ct)
    closeSidebar()
    navigate(`/add-feed?type=${ct}`, { replace: true })
  }, [navigate, closeSidebar])

  const handleCloseAddFeed = useCallback(() => {
    navigate(`/all?type=${contentType}`, { replace: true })
  }, [navigate, contentType])

  const handleMarkAllRead = useCallback(() => {
    markAllAsRead(selectionToParams(selection, contentType))
  }, [markAllAsRead, selection, contentType])

  const handleMarkAllReadAndGoNextFeed = useCallback(() => {
    if (selection.type !== 'feed' && selection.type !== 'folder') {
      handleMarkAllRead()
      return
    }

    const candidates = feeds.filter((f) => f.type === contentType)
    if (candidates.length === 0) {
      handleMarkAllRead()
      return
    }

    const currentFeedId = selection.type === 'feed' ? selection.feedId : null

    let startIndex = 0
    if (selection.type === 'feed') {
      const idx = candidates.findIndex((f) => f.id === selection.feedId)
      startIndex = idx >= 0 ? idx + 1 : 0
    } else {
      // folder: start after the last feed belonging to this folder in the current ordering
      let lastIdx = -1
      for (let i = 0; i < candidates.length; i += 1) {
        if (candidates[i]?.folderId === selection.folderId) {
          lastIdx = i
        }
      }
      startIndex = lastIdx >= 0 ? lastIdx + 1 : 0
    }

    const counts = unreadCounts?.counts ?? {}
    let nextFeedId: string | null = null

    const shouldSkipFeed = (feed: Feed) => {
      if (selection.type === 'folder') {
        return feed.folderId === selection.folderId
      }
      if (currentFeedId) {
        return feed.id === currentFeedId
      }
      return false
    }

    // Prefer next feed with unread items
    for (let offset = 0; offset < candidates.length; offset += 1) {
      const idx = (startIndex + offset) % candidates.length
      const feed = candidates[idx]
      if (!feed) continue
      if (shouldSkipFeed(feed)) continue
      if ((counts[feed.id] ?? 0) > 0) {
        nextFeedId = feed.id
        break
      }
    }

    // Fallback: next in ordering
    if (!nextFeedId) {
      for (let offset = 0; offset < candidates.length; offset += 1) {
        const idx = (startIndex + offset) % candidates.length
        const feed = candidates[idx]
        if (!feed) continue
        if (shouldSkipFeed(feed)) continue
        nextFeedId = feed.id
        break
      }
    }

    markAllAsRead(selectionToParams(selection, contentType), {
      onSuccess: () => {
        if (nextFeedId) {
          handleSelectFeed(nextFeedId)
        }
      },
    })
  }, [selection, contentType, feeds, unreadCounts?.counts, markAllAsRead, handleSelectFeed, handleMarkAllRead])

  const handleSelectAll = useCallback((type?: ContentType) => {
    closeSidebar()
    selectAll(type, { replace: true })
  }, [selectAll, closeSidebar])

  const visibleContentTypes = useMemo(() => {
    const current = appearanceSettings?.contentTypes
    if (!current || current.length === 0) return defaultContentTypes
    return current.filter((item) => item === 'article' || item === 'picture' || item === 'notification')
  }, [appearanceSettings])

  useEffect(() => {
    if (!visibleContentTypes.includes(contentType)) {
      const next = visibleContentTypes[0] ?? 'article'
      selectAll(next, { replace: true })
    }
  }, [visibleContentTypes, contentType, selectAll])

  const entryContent = selectedEntryId ? (
    <Suspense fallback={<EntryContentFallback />}>
      <LazyEntryContent key={selectedEntryId} entryId={selectedEntryId} />
    </Suspense>
  ) : (
    <EntryContentPlaceholder message={t('entry.select_article')} />
  )

  const mobileEntryContent = selectedEntryId ? (
    <Suspense fallback={<EntryContentFallback />}>
      <LazyEntryContent
        key={selectedEntryId}
        entryId={selectedEntryId}
        isMobile
        onBack={showList}
      />
    </Suspense>
  ) : (
    <EntryContentPlaceholder message={t('entry.select_article')} />
  )

  // Redirect root to /all with first visible type (must be after ALL hooks including useCallback)
  if (location === '/') {
    // 等待 appearanceSettings 加载完成再跳转，避免先跳 article 再跳正确类型
    if (isAppearanceLoading) {
      return <AppBootstrapShell />
    }
    const defaultType = visibleContentTypes[0] ?? 'article'
    return <Redirect to={`/all?type=${defaultType}`} replace />
  }

  // 等待 appearanceSettings 加载完成，避免显示默认三视图的闪烁
  if (isAppearanceLoading) {
    return <AppBootstrapShell />
  }

  // Sidebar component (shared between mobile and desktop)
  const sidebarContent = (
    <Sidebar
      onAddClick={handleAddClick}
      selection={selection}
      onSelectFeed={handleSelectFeed}
      onSelectFolder={handleSelectFolder}
      onSelectStarred={handleSelectStarred}
      onSelectAll={handleSelectAll}
      contentType={contentType}
      appearanceSettings={appearanceSettings}
    />
  )

  // Mobile layout - Sheet is rendered once at the top level to prevent animation flickering
  if (isMobile) {
    // Determine mobile content based on current route/mode
    let mobileContent: React.ReactNode

    if (isAddFeedPath(location)) {
      mobileContent = (
        <div className="fixed inset-0 overflow-hidden safe-area-top">
          <AddFeedPage onClose={handleCloseAddFeed} contentType={addFeedContentType} />
        </div>
      )
    } else if (contentType === 'picture') {
      mobileContent = (
        <div className="fixed inset-0 flex flex-col overflow-hidden safe-area-top">
          <PictureMasonry
            selection={selection}
            contentType={contentType}
            unreadOnly={unreadOnly}
            onToggleUnreadOnly={toggleUnreadOnly}
            onMarkAllRead={handleMarkAllRead}
            isMobile
            onMenuClick={openSidebar}
          />
        </div>
      )
    } else {
      // Both list and detail use window as the scroll container so that mobile
      // browsers auto-hide the address bar / toolbar on scroll.
      // Only one panel is in document flow at a time; the other is hidden.
      mobileContent = (
        <div className="relative min-h-dvh">
          {/* List view - in document flow for window scroll.
               Hidden (display:none) when detail is open so it doesn't
               interfere with window scroll or virtualizer calculations. */}
          <div className={cn(
            'bg-background',
            mobileDetailOpen && 'hidden'
          )}>
            <EntryList
              selection={selection}
              selectedEntryId={selectedEntryId}
              onSelectEntry={selectEntry}
              onMarkAllRead={handleMarkAllRead}
              onMarkAllReadAndGoNextFeed={handleMarkAllReadAndGoNextFeed}
              unreadOnly={unreadOnly}
              onToggleUnreadOnly={toggleUnreadOnly}
              contentType={contentType}
              isMobile
              isActive={!mobileDetailOpen}
              onMenuClick={openSidebar}
            />
          </div>
          {/* Detail view - shown only when an entry is selected (tap to enter) */}
          <div className={cn(
            'absolute inset-0 bg-background safe-area-top',
            mobileDetailOpen ? 'block' : 'hidden'
          )}>
            {mobileEntryContent}          </div>
        </div>
      )
    }

    return (
      <>
        {mobileContent}
        <ScrollToTopZone />
        {/* Lightbox for picture mode */}
        {contentType === 'picture' && <Lightbox />}
        {/* ImagePreview for article/notification mode */}
        {contentType !== 'picture' && <ImagePreview />}
        {/* Sheet rendered once to prevent animation flickering on route/mode changes */}
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          {sidebarContent}
        </Sheet>
      </>
    )
  }

  // Desktop layout
  if (isAddFeedPath(location)) {
    return (
      <ThreeColumnLayout
        sidebar={sidebarContent}
        list={null}
        content={<AddFeedPage onClose={handleCloseAddFeed} contentType={addFeedContentType} />}
        hideList
        showSidebar={showSidebar}
      />
    )
  }

  // Desktop picture mode - two column layout
  if (contentType === 'picture') {
    return (
      <>
        <ThreeColumnLayout
          sidebar={sidebarContent}
          list={null}
          content={
            <PictureMasonry
              selection={selection}
              contentType={contentType}
              unreadOnly={unreadOnly}
              onToggleUnreadOnly={toggleUnreadOnly}
              onMarkAllRead={handleMarkAllRead}
              isTablet={isTablet}
              onToggleSidebar={toggleSidebarVisible}
              sidebarVisible={sidebarVisible}
            />
          }
          hideList
          showSidebar={showSidebar}
        />
        <Lightbox />
      </>
    )
  }

  return (
    <>
      <ThreeColumnLayout
        sidebar={sidebarContent}
        list={
          <EntryList
            selection={selection}
            selectedEntryId={selectedEntryId}
            onSelectEntry={selectEntry}
            onMarkAllRead={handleMarkAllRead}
            onMarkAllReadAndGoNextFeed={handleMarkAllReadAndGoNextFeed}
            unreadOnly={unreadOnly}
            onToggleUnreadOnly={toggleUnreadOnly}
            contentType={contentType}
            isTablet={isTablet}
            onToggleSidebar={toggleSidebarVisible}
            sidebarVisible={sidebarVisible}
          />
        }
        content={entryContent}
        showSidebar={showSidebar}
      />
      <ImagePreview />
    </>
  )
}

function AppContent() {
  const { isLoading, isAuthenticated, needsRegistration, needsLogin, isNetworkError, error, login, register, retry, clearError } = useAuth()

  if (isLoading) {
    return <LoadingScreen />
  }

  if (isNetworkError) {
    return <NetworkErrorPage onRetry={retry} />
  }

  if (needsRegistration) {
    return <RegisterPage onRegister={register} error={error} onClearError={clearError} />
  }

  if (needsLogin) {
    return <LoginPage onLogin={login} error={error} onClearError={clearError} />
  }

  if (isAuthenticated) {
    return <AuthenticatedApp />
  }

  return <LoadingScreen />
}

function App() {
  return (
    <TooltipProvider delayDuration={300}>
      <Router>
        <AppContent />
        <UpdateNotice />
      </Router>
    </TooltipProvider>
  )
}

export default App
