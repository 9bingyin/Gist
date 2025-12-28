import { SidebarHeader } from './SidebarHeader'
import { StarredItem } from './StarredItem'
import { FeedCategory } from './FeedCategory'
import { FeedItem } from './FeedItem'

interface SidebarProps {
  onAddClick?: () => void
}

// Mock data for demonstration
const mockFeeds = [
  {
    category: 'Tech',
    unreadCount: 22,
    feeds: [
      { id: '1', name: 'Hacker News', unreadCount: 8 },
      { id: '2', name: 'TechCrunch', unreadCount: 10 },
      { id: '3', name: 'The Verge', unreadCount: 4 },
    ],
  },
  {
    category: 'Design',
    unreadCount: 15,
    feeds: [
      { id: '4', name: 'Dribbble', unreadCount: 7 },
      { id: '5', name: 'Behance', unreadCount: 5 },
      { id: '6', name: 'Awwwards', unreadCount: 3 },
    ],
  },
  {
    category: 'News',
    unreadCount: 30,
    feeds: [
      { id: '7', name: 'BBC News', unreadCount: 12 },
      { id: '8', name: 'Reuters', unreadCount: 18 },
    ],
  },
  {
    category: 'Blogs',
    unreadCount: 8,
    feeds: [
      { id: '9', name: 'CSS-Tricks', unreadCount: 3 },
      { id: '10', name: 'Smashing Magazine', unreadCount: 5 },
    ],
  },
]

export function Sidebar({ onAddClick }: SidebarProps) {
  return (
    <div className="flex h-full flex-col">
      <SidebarHeader onAddClick={onAddClick} />

      <div className="flex-1 overflow-auto px-1">
        {/* Starred section */}
        <StarredItem />

        {/* Feed categories */}
        <div className="mt-2 space-y-px">
          {mockFeeds.map((category) => (
            <FeedCategory
              key={category.category}
              name={category.category}
              unreadCount={category.unreadCount}
            >
              {category.feeds.map((feed) => (
                <FeedItem
                  key={feed.id}
                  name={feed.name}
                  unreadCount={feed.unreadCount}
                />
              ))}
            </FeedCategory>
          ))}
        </div>
      </div>
    </div>
  )
}
