import { useCallback, useState } from 'react'
import { Router, useLocation } from 'wouter'
import { ThreeColumnLayout } from '@/components/layout/three-column-layout'
import { Sidebar } from '@/components/sidebar'
import { AddFeedPage } from '@/components/add-feed'
import { EntryList } from '@/components/entry-list'
import { EntryContent } from '@/components/entry-content'
import { useSelection, selectionToParams } from '@/hooks/useSelection'
import { useMarkAllAsRead } from '@/hooks/useEntries'
import { isAddFeedPath } from '@/lib/router'
import type { ContentType } from '@/types/api'

function AppContent() {
  const [location, navigate] = useLocation()

  // Redirect root to /all
  if (location === '/') {
    navigate('/all', { replace: true })
    return null
  }

  const {
    selection,
    selectFeed,
    selectFolder,
    selectStarred,
    selectedEntryId,
    selectEntry,
    unreadOnly,
    toggleUnreadOnly,
  } = useSelection()

  const { mutate: markAllAsRead } = useMarkAllAsRead()
  const [addFeedContentType, setAddFeedContentType] = useState<ContentType>('article')

  const handleAddClick = useCallback((contentType: ContentType) => {
    setAddFeedContentType(contentType)
    navigate('/add-feed')
  }, [navigate])

  const handleCloseAddFeed = useCallback(() => {
    navigate('/all')
  }, [navigate])

  const handleMarkAllRead = useCallback(() => {
    markAllAsRead(selectionToParams(selection))
  }, [markAllAsRead, selection])

  if (isAddFeedPath(location)) {
    return (
      <ThreeColumnLayout
        sidebar={
          <Sidebar
            onAddClick={handleAddClick}
            selection={selection}
            onSelectFeed={selectFeed}
            onSelectFolder={selectFolder}
            onSelectStarred={selectStarred}
          />
        }
        list={null}
        content={<AddFeedPage onClose={handleCloseAddFeed} contentType={addFeedContentType} />}
        hideList
      />
    )
  }

  return (
    <ThreeColumnLayout
      sidebar={
        <Sidebar
          onAddClick={handleAddClick}
          selection={selection}
          onSelectFeed={selectFeed}
          onSelectFolder={selectFolder}
          onSelectStarred={selectStarred}
        />
      }
      list={
        <EntryList
          selection={selection}
          selectedEntryId={selectedEntryId}
          onSelectEntry={selectEntry}
          onMarkAllRead={handleMarkAllRead}
          unreadOnly={unreadOnly}
          onToggleUnreadOnly={toggleUnreadOnly}
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
