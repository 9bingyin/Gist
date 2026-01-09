import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useFeeds } from '@/hooks/useFeeds'
import { deleteFeeds, refreshAllFeeds, ApiError } from '@/api'
import { cn } from '@/lib/utils'
import { EditFeedDialog } from './EditFeedDialog'
import type { Feed } from '@/types/api'

type SortField = 'title' | 'createdAt' | 'updatedAt'
type SortDirection = 'asc' | 'desc'

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function formatDateTime(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function FeedsSettings() {
  const { t } = useTranslation()
  const { data: feeds = [], isLoading, refetch } = useFeeds()
  const queryClient = useQueryClient()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sortField, setSortField] = useState<SortField>('title')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [editingFeed, setEditingFeed] = useState<Feed | null>(null)

  const sortedFeeds = useMemo(() => {
    const isAscii = (str: string) => /^[\x00-\x7F]/.test(str)

    return [...feeds].sort((a, b) => {
      let cmp = 0
      if (sortField === 'title') {
        const aIsAscii = isAscii(a.title)
        const bIsAscii = isAscii(b.title)
        if (aIsAscii && !bIsAscii) {
          cmp = -1
        } else if (!aIsAscii && bIsAscii) {
          cmp = 1
        } else {
          cmp = a.title.localeCompare(b.title, 'zh-CN')
        }
      } else if (sortField === 'createdAt') {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      } else if (sortField === 'updatedAt') {
        cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
      }
      return sortDirection === 'asc' ? cmp : -cmp
    })
  }, [feeds, sortField, sortDirection])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <span className="ml-1 text-muted-foreground/50">-</span>
    }
    return <span className="ml-1">{sortDirection === 'asc' ? '\u2191' : '\u2193'}</span>
  }

  const handleSelectAll = () => {
    if (selectedIds.size === feeds.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(feeds.map((f) => f.id)))
    }
  }

  const handleSelect = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const handleRefreshAll = async () => {
    setError(null)
    setIsRefreshing(true)
    try {
      await refreshAllFeeds()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(t('feeds.refresh_in_progress'))
      } else {
        setError(t('feeds.refresh_failed'))
      }
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return

    setError(null)
    setIsDeleting(true)
    try {
      await deleteFeeds(Array.from(selectedIds))
      setSelectedIds(new Set())
      await refetch()
      queryClient.invalidateQueries({ queryKey: ['folders'] })
      queryClient.invalidateQueries({ queryKey: ['unreadCounts'] })
    } catch {
      setError(t('feeds.delete_failed'))
    } finally {
      setIsDeleting(false)
    }
  }

  const isAllSelected = feeds.length > 0 && selectedIds.size === feeds.length
  const isPartialSelected = selectedIds.size > 0 && selectedIds.size < feeds.length

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground">
          {t('feeds.subscribed_feeds', { count: feeds.length })}
        </h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefreshAll}
            disabled={isRefreshing}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              'bg-primary text-primary-foreground hover:bg-primary/90',
              'disabled:cursor-not-allowed disabled:opacity-50'
            )}
          >
            <svg
              className={cn('size-4', isRefreshing && 'animate-spin')}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <span>{isRefreshing ? t('feeds.refreshing') : t('feeds.refresh_all')}</span>
          </button>
          <button
            type="button"
            onClick={handleDeleteSelected}
            disabled={selectedIds.size === 0 || isDeleting}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              'bg-destructive text-destructive-foreground hover:bg-destructive/90',
              'disabled:cursor-not-allowed disabled:opacity-50'
            )}
          >
            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            <span>{isDeleting ? t('feeds.deleting') : t('feeds.delete_count', { count: selectedIds.size })}</span>
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Table */}
      {feeds.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center">
          <p className="text-sm text-muted-foreground">{t('feeds.no_feeds')}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="w-10 px-3 py-2 text-left">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className={cn(
                      'flex size-4 items-center justify-center rounded border transition-colors',
                      isAllSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : isPartialSelected
                          ? 'border-primary bg-primary/50 text-primary-foreground'
                          : 'border-border bg-background hover:border-primary/50'
                    )}
                  >
                    {(isAllSelected || isPartialSelected) && (
                      <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d={isPartialSelected ? 'M5 12h14' : 'M5 13l4 4L19 7'}
                        />
                      </svg>
                    )}
                  </button>
                </th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => handleSort('title')}
                    className="flex items-center hover:text-foreground transition-colors"
                  >
                    {t('feeds.name')}
                    <SortIcon field="title" />
                  </button>
                </th>
                <th className="w-28 px-3 py-2 text-left font-medium text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => handleSort('createdAt')}
                    className="flex items-center hover:text-foreground transition-colors"
                  >
                    {t('feeds.subscribe_date')}
                    <SortIcon field="createdAt" />
                  </button>
                </th>
                <th className="w-36 px-3 py-2 text-left font-medium text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => handleSort('updatedAt')}
                    className="flex items-center hover:text-foreground transition-colors"
                  >
                    {t('feeds.last_update')}
                    <SortIcon field="updatedAt" />
                  </button>
                </th>
                <th className="w-16 px-3 py-2 text-left font-medium text-muted-foreground">
                  {t('feeds.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedFeeds.map((feed: Feed) => {
                const isSelected = selectedIds.has(feed.id)
                return (
                  <tr
                    key={feed.id}
                    className={cn(
                      'transition-colors',
                      isSelected ? 'bg-primary/5' : 'hover:bg-muted/30'
                    )}
                  >
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => handleSelect(feed.id)}
                        className={cn(
                          'flex size-4 items-center justify-center rounded border transition-colors',
                          isSelected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-background hover:border-primary/50'
                        )}
                      >
                        {isSelected && (
                          <svg
                            className="size-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </button>
                    </td>
                    <td className="max-w-[200px] px-3 py-2">
                      <div className="flex items-center gap-2">
                        {feed.iconPath ? (
                          <img
                            src={`/icons/${feed.iconPath}`}
                            alt=""
                            className="size-4 shrink-0 rounded object-contain"
                          />
                        ) : (
                          <div className="flex size-4 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
                            <svg
                              className="size-3"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1.5}
                                d="M6 5c7.18 0 13 5.82 13 13M6 11a7 7 0 017 7m-6 0a1 1 0 11-2 0 1 1 0 012 0z"
                              />
                            </svg>
                          </div>
                        )}
                        <span className="truncate font-medium" title={feed.title}>
                          {feed.title}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatDate(feed.createdAt)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatDateTime(feed.updatedAt)}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setEditingFeed(feed)}
                        className={cn(
                          'flex size-7 items-center justify-center rounded transition-colors',
                          'text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                        title={t('feeds.edit')}
                      >
                        <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <EditFeedDialog
        feed={editingFeed}
        open={editingFeed !== null}
        onOpenChange={(open) => !open && setEditingFeed(null)}
      />
    </div>
  )
}
