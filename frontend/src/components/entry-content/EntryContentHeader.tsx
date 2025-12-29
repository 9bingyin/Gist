import type { Entry } from '@/types/api'

interface EntryContentHeaderProps {
  entry: Entry
}

export function EntryContentHeader({ entry }: EntryContentHeaderProps) {
  const publishedAt = entry.publishedAt
    ? new Date(entry.publishedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null

  return (
    <div className="border-b border-border px-6 py-4">
      <h1 className="text-xl font-bold">{entry.title || 'Untitled'}</h1>
      <div className="mt-2 flex items-center gap-3 text-sm text-muted-foreground">
        {entry.author && <span>{entry.author}</span>}
        {publishedAt && <span>{publishedAt}</span>}
      </div>
    </div>
  )
}
