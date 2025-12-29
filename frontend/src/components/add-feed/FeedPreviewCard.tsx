import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { isSafeUrl, getSafeHostname } from '@/lib/url'
import type { FeedPreview, Folder } from '@/types/api'

interface FeedPreviewCardProps {
  feed: FeedPreview
  folders: Folder[]
  onSubscribe: (url: string, options: { folderName?: string; title?: string }) => void
  isLoading?: boolean
}

export function FeedPreviewCard({ feed, folders, onSubscribe, isLoading = false }: FeedPreviewCardProps) {
  const [customTitle, setCustomTitle] = useState('')
  const [folderInput, setFolderInput] = useState('')
  const [showOptions, setShowOptions] = useState(false)
  const [showFolderDropdown, setShowFolderDropdown] = useState(false)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const filteredFolders = useMemo(() => {
    if (!folderInput.trim()) {
      return folders
    }
    const lowerInput = folderInput.toLowerCase()
    return folders.filter((folder) =>
      folder.name.toLowerCase().includes(lowerInput)
    )
  }, [folders, folderInput])

  const isNewFolder = useMemo(() => {
    if (!folderInput.trim()) return false
    return !folders.some(
      (folder) => folder.name.toLowerCase() === folderInput.trim().toLowerCase()
    )
  }, [folders, folderInput])

  const handleSubscribe = useCallback(() => {
    onSubscribe(feed.url, {
      title: customTitle || undefined,
      folderName: folderInput.trim() || undefined,
    })
  }, [feed.url, customTitle, folderInput, onSubscribe])

  const handleFolderSelect = useCallback((folderName: string) => {
    setFolderInput(folderName)
    setShowFolderDropdown(false)
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        folderInputRef.current &&
        !folderInputRef.current.contains(event.target as Node)
      ) {
        setShowFolderDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const displayTitle = customTitle || feed.title

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Feed Header */}
      <div className="flex items-start gap-4 p-4">
        {/* Feed Icon */}
        <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-accent">
          {feed.imageUrl && isSafeUrl(feed.imageUrl) ? (
            <img
              src={feed.imageUrl}
              alt=""
              className="size-12 rounded-lg object-cover"
            />
          ) : (
            <svg className="size-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 5c7.18 0 13 5.82 13 13M6 11a7 7 0 017 7m-6 0a1 1 0 11-2 0 1 1 0 012 0z" />
            </svg>
          )}
        </div>

        {/* Feed Info */}
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold">{displayTitle}</h3>
          {feed.description && (
            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
              {feed.description}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {feed.siteUrl && isSafeUrl(feed.siteUrl) && (
              <a
                href={feed.siteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:text-primary transition-colors"
              >
                <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                <span className="truncate max-w-[180px]">{getSafeHostname(feed.siteUrl)}</span>
              </a>
            )}
            {feed.itemCount !== undefined && (
              <span className="inline-flex items-center gap-1">
                <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {feed.itemCount} items
              </span>
            )}
            {feed.lastUpdated && (
              <span className="inline-flex items-center gap-1">
                <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {formatRelativeTime(feed.lastUpdated)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Options Section */}
      {showOptions && (
        <div className="border-t border-border bg-accent/30 px-4 py-3 space-y-3">
          {/* Custom Title */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Custom Title (optional)
            </label>
            <input
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder={feed.title}
              className={cn(
                'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm',
                'placeholder:text-muted-foreground/60',
                'focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20'
              )}
            />
          </div>

          {/* Folder */}
          <div className="relative">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Folder (optional)
            </label>
            <input
              ref={folderInputRef}
              type="text"
              value={folderInput}
              onChange={(e) => setFolderInput(e.target.value)}
              onFocus={() => setShowFolderDropdown(true)}
              placeholder="Select or create folder"
              className={cn(
                'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm',
                'placeholder:text-muted-foreground/60',
                'focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20'
              )}
            />
            {showFolderDropdown && (filteredFolders.length > 0 || isNewFolder) && (
              <div
                ref={dropdownRef}
                className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-background shadow-lg max-h-48 overflow-auto"
              >
                {isNewFolder && (
                  <button
                    type="button"
                    onClick={() => handleFolderSelect(folderInput.trim())}
                    className={cn(
                      'w-full px-3 py-2 text-left text-sm hover:bg-accent',
                      'flex items-center gap-2 text-primary'
                    )}
                  >
                    <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Create "{folderInput.trim()}"
                  </button>
                )}
                {filteredFolders.map((folder) => (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => handleFolderSelect(folder.name)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    {folder.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between border-t border-border px-4 py-3">
        <button
          type="button"
          onClick={() => setShowOptions(!showOptions)}
          className={cn(
            'inline-flex items-center gap-1.5 text-sm',
            'text-muted-foreground hover:text-foreground',
            'transition-colors duration-200'
          )}
        >
          <svg
            className={cn('size-4 transition-transform duration-200', showOptions && 'rotate-180')}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          {showOptions ? 'Hide options' : 'More options'}
        </button>

        <button
          type="button"
          onClick={handleSubscribe}
          disabled={isLoading}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg px-4 py-2',
            'bg-primary text-primary-foreground text-sm font-medium',
            'transition-all duration-200',
            'hover:bg-primary/90',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
        >
          {isLoading ? (
            <>
              <svg className="size-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Subscribing...</span>
            </>
          ) : (
            <>
              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Subscribe</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) return 'just now'
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`

  return date.toLocaleDateString()
}
