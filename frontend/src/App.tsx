import { useCallback, useState } from 'react'
import { Router, useLocation, Redirect } from 'wouter'
import { ThreeColumnLayout } from '@/components/layout/three-column-layout'
import { Sheet } from '@/components/ui/sheet'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Sidebar } from '@/components/sidebar'
import { AddFeedPage } from '@/components/add-feed'
import { EntryList } from '@/components/entry-list'
import { EntryContent } from '@/components/entry-content'
import { PictureMasonry, Lightbox } from '@/components/picture-masonry'
import { LoginPage, RegisterPage } from '@/components/auth'
import { useSelection, selectionToParams } from '@/hooks/useSelection'
import { useMarkAllAsRead } from '@/hooks/useEntries'
import { useMobileLayout } from '@/hooks/useMobileLayout'
import { useAuth } from '@/hooks/useAuth'
import { isAddFeedPath } from '@/lib/router'
import { cn } from '@/lib/utils'
import type { ContentType } from '@/types/api'

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  )
}

function AuthenticatedApp() {
  const [location, navigate] = useLocation()
  const {
    isMobile,
    mobileView,
    sidebarOpen,
    setSidebarOpen,
    showList,
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

  // Mobile-aware selection handlers (all hooks must be before any conditional returns)
  const handleSelectFeed = useCallback((feedId: string) => {
    selectFeed(feedId)
    closeSidebar()
  }, [selectFeed, closeSidebar])

  const handleSelectFolder = useCallback((folderId: string) => {
    selectFolder(folderId)
    closeSidebar()
  }, [selectFolder, closeSidebar])

  const handleSelectStarred = useCallback(() => {
    selectStarred()
    closeSidebar()
  }, [selectStarred, closeSidebar])

  const handleSelectEntry = useCallback((entryId: string) => {
    selectEntry(entryId)
  }, [selectEntry])

  const handleAddClick = useCallback((ct: ContentType) => {
    setAddFeedContentType(ct)
    navigate(`/add-feed?type=${ct}`)
    closeSidebar()
  }, [navigate, closeSidebar])

  const handleCloseAddFeed = useCallback(() => {
    navigate(`/all?type=${contentType}`)
  }, [navigate, contentType])

  const handleMarkAllRead = useCallback(() => {
    markAllAsRead(selectionToParams(selection, contentType))
  }, [markAllAsRead, selection, contentType])

  const handleOpenSidebar = useCallback(() => {
    setSidebarOpen(true)
  }, [setSidebarOpen])

  // Redirect root to /all with default type (must be after ALL hooks including useCallback)
  if (location === '/') {
    return <Redirect to="/all?type=article" replace />
  }

  // Sidebar component (shared between mobile and desktop)
  const sidebarContent = (
    <Sidebar
      onAddClick={handleAddClick}
      selection={selection}
      onSelectFeed={handleSelectFeed}
      onSelectFolder={handleSelectFolder}
      onSelectStarred={handleSelectStarred}
      onSelectAll={selectAll}
      contentType={contentType}
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
            onMenuClick={handleOpenSidebar}
          />
        </div>
      )
    } else {
      // List and detail views rendered together, controlled by CSS
      mobileContent = (
        <div className="relative h-dvh w-screen max-w-full overflow-hidden safe-area-top">
          {/* List view - always rendered to preserve scroll position */}
          <div className={cn(
            'absolute inset-0 flex flex-col overflow-hidden bg-background',
            mobileView === 'detail' && 'invisible'
          )}>
            <EntryList
              selection={selection}
              selectedEntryId={selectedEntryId}
              onSelectEntry={handleSelectEntry}
              onMarkAllRead={handleMarkAllRead}
              unreadOnly={unreadOnly}
              onToggleUnreadOnly={toggleUnreadOnly}
              contentType={contentType}
              isMobile
              onMenuClick={handleOpenSidebar}
            />
          </div>
          {/* Detail view - slides in from right */}
          <div className={cn(
            'absolute inset-0 bg-background transition-transform duration-300 ease-out',
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
            />
          }
          hideList
        />
        <Lightbox />
      </>
    )
  }

  return (
    <ThreeColumnLayout
      sidebar={sidebarContent}
      list={
        <EntryList
          selection={selection}
          selectedEntryId={selectedEntryId}
          onSelectEntry={handleSelectEntry}
          onMarkAllRead={handleMarkAllRead}
          unreadOnly={unreadOnly}
          onToggleUnreadOnly={toggleUnreadOnly}
          contentType={contentType}
        />
      }
      content={<EntryContent key={selectedEntryId} entryId={selectedEntryId} />}
    />
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
      </Router>
    </TooltipProvider>
  )
}

export default App
