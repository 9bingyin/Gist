import { useState, useCallback } from 'react'
import { ThreeColumnLayout } from '@/components/layout/three-column-layout'
import { Sidebar } from '@/components/sidebar'
import { AddFeedPage } from '@/components/add-feed'
import { EntryList } from '@/components/entry-list'
import { EntryContent } from '@/components/entry-content'
import { useSelection, selectionToParams } from '@/hooks/useSelection'
import { useMarkAllAsRead } from '@/hooks/useEntries'

type PageView = 'feed' | 'add-feed'

function App() {
  const [currentView, setCurrentView] = useState<PageView>('feed')

  const {
    selection,
    selectAll,
    selectFeed,
    selectFolder,
    selectedEntryId,
    selectEntry,
  } = useSelection()

  const { mutate: markAllAsRead } = useMarkAllAsRead()

  const handleAddClick = useCallback(() => {
    setCurrentView('add-feed')
  }, [])

  const handleCloseAddFeed = useCallback(() => {
    setCurrentView('feed')
  }, [])

  const handleMarkAllRead = useCallback(() => {
    markAllAsRead(selectionToParams(selection))
  }, [markAllAsRead, selection])

  if (currentView === 'add-feed') {
    return (
      <ThreeColumnLayout
        sidebar={
          <Sidebar
            onAddClick={handleAddClick}
            selection={selection}
            onSelectAll={selectAll}
            onSelectFeed={selectFeed}
            onSelectFolder={selectFolder}
          />
        }
        list={null}
        content={<AddFeedPage onClose={handleCloseAddFeed} />}
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
          onSelectAll={selectAll}
          onSelectFeed={selectFeed}
          onSelectFolder={selectFolder}
        />
      }
      list={
        <EntryList
          selection={selection}
          selectedEntryId={selectedEntryId}
          onSelectEntry={selectEntry}
          onMarkAllRead={handleMarkAllRead}
        />
      }
      content={<EntryContent entryId={selectedEntryId} />}
    />
  )
}

export default App
