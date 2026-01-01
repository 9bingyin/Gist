import { useCallback, useState } from 'react'
import { Router, useLocation, Redirect } from 'wouter'
import { ThreeColumnLayout } from '@/components/layout/three-column-layout'
import { Sheet } from '@/components/ui/sheet'
import { Sidebar } from '@/components/sidebar'
import { AddFeedPage } from '@/components/add-feed'
import { EntryList } from '@/components/entry-list'
import { EntryContent } from '@/components/entry-content'
import { useSelection, selectionToParams } from '@/hooks/useSelection'
import { useMarkAllAsRead } from '@/hooks/useEntries'
import { useMobileLayout } from '@/hooks/useMobileLayout'
import { isAddFeedPath } from '@/lib/router'
import type { ContentType } from '@/types/api'

function AppContent() {
  const [location, navigate] = useLocation()
  const {
    isMobile,
    mobileView,
    sidebarOpen,
    setSidebarOpen,
    showDetail,
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
    setContentType,
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
    if (isMobile) showDetail()
  }, [selectEntry, isMobile, showDetail])

  const handleAddClick = useCallback((contentType: ContentType) => {
    setAddFeedContentType(contentType)
    navigate('/add-feed')
    closeSidebar()
  }, [navigate, closeSidebar])

  const handleCloseAddFeed = useCallback(() => {
    navigate('/all')
  }, [navigate])

  const handleMarkAllRead = useCallback(() => {
    markAllAsRead(selectionToParams(selection, contentType))
  }, [markAllAsRead, selection, contentType])

  const handleOpenSidebar = useCallback(() => {
    setSidebarOpen(true)
  }, [setSidebarOpen])

  // Redirect root to /all (must be after ALL hooks including useCallback)
  if (location === '/') {
    return <Redirect to="/all" replace />
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
      onContentTypeChange={setContentType}
    />
  )

  // Mobile layout
  if (isMobile) {
    if (isAddFeedPath(location)) {
      return (
        <>
          <div className="h-screen">
            <AddFeedPage onClose={handleCloseAddFeed} contentType={addFeedContentType} />
          </div>
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            {sidebarContent}
          </Sheet>
        </>
      )
    }

    return (
      <>
        <div className="h-screen flex flex-col overflow-hidden">
          {mobileView === 'list' ? (
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
          ) : (
            <EntryContent
              key={selectedEntryId}
              entryId={selectedEntryId}
              isMobile
              onBack={showList}
            />
          )}
        </div>
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

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  )
}

export default App
