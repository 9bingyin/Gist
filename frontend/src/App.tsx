import { useState, useCallback } from 'react'
import { ThreeColumnLayout } from '@/components/layout/three-column-layout'
import { Sidebar } from '@/components/sidebar'
import { AddFeedPage } from '@/components/add-feed'

type PageView = 'feed' | 'add-feed'

function ListPlaceholder() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 items-center border-b border-border px-4">
        <h2 className="text-sm font-medium">All Articles</h2>
        <span className="ml-2 text-xs text-muted-foreground">42 items</span>
      </div>
      <div className="flex-1 overflow-auto">
        {Array.from({ length: 20 }, (_, i) => (
          <div
            key={i}
            className="border-b border-border px-4 py-3 hover:bg-accent/30 cursor-pointer"
          >
            <div className="text-sm font-medium line-clamp-1">
              Article Title {i + 1}
            </div>
            <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
              This is a brief description of the article content. It provides a preview of what the article is about...
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span>Tech News</span>
              <span>2h ago</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ContentPlaceholder() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 items-center border-b border-border px-6">
      </div>
      <div className="flex-1 overflow-auto px-6 py-8">
        <article className="mx-auto max-w-2xl">
          <h1 className="text-2xl font-bold">Welcome to Gist</h1>
          <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <span>Tech News</span>
            <span>Dec 28, 2025</span>
          </div>
          <div className="mt-6 space-y-4 text-foreground/90 leading-relaxed">
            <p>
              This is a placeholder for article content. The three-column layout is now working with resizable panels.
            </p>
            <p>
              You can drag the splitters between columns to resize them. Double-click on a splitter to reset it to its default width.
            </p>
            <p>
              The left sidebar is for navigation and feed list. The middle column shows the article list. The right column displays the article content.
            </p>
          </div>
        </article>
      </div>
    </div>
  )
}

function App() {
  const [currentView, setCurrentView] = useState<PageView>('feed')

  const handleAddClick = useCallback(() => {
    setCurrentView('add-feed')
  }, [])

  const handleCloseAddFeed = useCallback(() => {
    setCurrentView('feed')
  }, [])

  const handleFeedAdded = useCallback((feedUrl: string) => {
    console.log('Feed added:', feedUrl)
    // TODO: Refresh feed list
  }, [])

  // When in add-feed view, render full-width AddFeedPage in content area
  if (currentView === 'add-feed') {
    return (
      <ThreeColumnLayout
        sidebar={<Sidebar onAddClick={handleAddClick} />}
        list={null}
        content={
          <AddFeedPage
            onClose={handleCloseAddFeed}
            onFeedAdded={handleFeedAdded}
          />
        }
        hideList
      />
    )
  }

  return (
    <ThreeColumnLayout
      sidebar={<Sidebar onAddClick={handleAddClick} />}
      list={<ListPlaceholder />}
      content={<ContentPlaceholder />}
    />
  )
}

export default App
