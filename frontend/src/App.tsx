import { useCallback, useState, useMemo, useEffect } from 'react'
import { Router, useLocation, Redirect } from 'wouter'
import { useTranslation } from 'react-i18next'
import { ThreeColumnLayout } from '@/components/layout/three-column-layout'
import { Sheet } from '@/components/ui/sheet'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Sidebar } from '@/components/sidebar'
import { AddFeedPage } from '@/components/add-feed'
import { EntryList } from '@/components/entry-list'
import { EntryContent } from '@/components/entry-content'
import { PictureMasonry, Lightbox } from '@/components/picture-masonry'
import { ImagePreview } from '@/components/ui/image-preview'
import { LoginPage, RegisterPage } from '@/components/auth'
import { UpdateNotice } from '@/components/update-notice'
import { useSelection, selectionToParams } from '@/hooks/useSelection'
import { useMarkAllAsRead, useEntry } from '@/hooks/useEntries'
import { useMobileLayout } from '@/hooks/useMobileLayout'
import { useAuth } from '@/hooks/useAuth'
import { useFeeds } from '@/hooks/useFeeds'
import { useFolders } from '@/hooks/useFolders'
import { useAppearanceSettings } from '@/hooks/useAppearanceSettings'
import { useTitle, buildTitle } from '@/hooks/useTitle'
import { useUISettingKey, useUISettingActions, hasSidebarVisibilitySetting, setUISetting } from '@/hooks/useUISettings'
import { isAddFeedPath } from '@/lib/router'
import { cn } from '@/lib/utils'
import type { ContentType, Feed, Folder } from '@/types/api'

const defaultContentTypes: ContentType[] = ['article', 'picture', 'notification']

function LoadingScreen() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">{t('entry.loading')}</p>
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

  const { mutate: markAllAsRead } = useMarkAllAsRead()
  const [addFeedContentType, setAddFeedContentType] = useState<ContentType>('article')

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

  // Redirect root to /all with first visible type (must be after ALL hooks including useCallback)
  if (location === '/') {
    // 等待 appearanceSettings 加载完成再跳转，避免先跳 article 再跳正确类型
    if (isAppearanceLoading) {
      return <div className="h-dvh bg-background" />
    }
    const defaultType = visibleContentTypes[0] ?? 'article'
    return <Redirect to={`/all?type=${defaultType}`} replace />
  }

  // 等待 appearanceSettings 加载完成，避免显示默认三视图的闪烁
  if (isAppearanceLoading) {
    return <div className="h-dvh bg-background" />
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
        <div className="h-dvh safe-area-top">
          <AddFeedPage onClose={handleCloseAddFeed} contentType={addFeedContentType} />
        </div>
      )
    } else if (contentType === 'picture') {
      mobileContent = (
        <div className="h-dvh flex flex-col overflow-hidden safe-area-top">
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
      // List and detail views rendered together, controlled by CSS
      mobileContent = (
        <div className="relative h-dvh w-screen max-w-full overflow-hidden">
          {/* List view - always rendered to preserve scroll position */}
          <div className={cn(
            'absolute inset-0 flex flex-col overflow-hidden bg-background safe-area-top',
            mobileView === 'detail' && 'invisible'
          )}>
            <EntryList
              selection={selection}
              selectedEntryId={selectedEntryId}
              onSelectEntry={selectEntry}
              onMarkAllRead={handleMarkAllRead}
              unreadOnly={unreadOnly}
              onToggleUnreadOnly={toggleUnreadOnly}
              contentType={contentType}
              isMobile
              onMenuClick={openSidebar}
            />
          </div>
          {/* Detail view - slides in from right */}
          <div className={cn(
            'absolute inset-0 bg-background transition-transform duration-300 ease-out safe-area-top',
            mobileView === 'detail' ? 'translate-x-0' : 'translate-x-full'
          )}>
            <EntryContent
              key={selectedEntryId}
              entryId={selectedEntryId}
              isMobile
              onBack={showList}
            />
          </div>
        </div>
      )
    }

    return (
      <>
        {mobileContent}
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
            unreadOnly={unreadOnly}
            onToggleUnreadOnly={toggleUnreadOnly}
            contentType={contentType}
            isTablet={isTablet}
            onToggleSidebar={toggleSidebarVisible}
            sidebarVisible={sidebarVisible}
          />
        }
        content={<EntryContent key={selectedEntryId} entryId={selectedEntryId} />}
        showSidebar={showSidebar}
      />
      <ImagePreview />
    </>
  )
}

function AppContent() {
  const { isLoading, isAuthenticated, needsRegistration, needsLogin, error, login, register, clearError } = useAuth()

  if (isLoading) {
    return <LoadingScreen />
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
