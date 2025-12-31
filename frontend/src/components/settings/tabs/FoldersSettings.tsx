import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listFolders, deleteFolders } from '@/api'
import { cn } from '@/lib/utils'
import type { Folder } from '@/types/api'

type SortField = 'name' | 'createdAt' | 'updatedAt'
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

export function FoldersSettings() {
  const { data: folders = [], isLoading, refetch } = useQuery({
    queryKey: ['folders'],
    queryFn: listFolders,
  })
  const queryClient = useQueryClient()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const sortedFolders = useMemo(() => {
    const isAscii = (str: string) => /^[\x00-\x7F]/.test(str)

    return [...folders].sort((a, b) => {
      let cmp = 0
      if (sortField === 'name') {
        const aIsAscii = isAscii(a.name)
        const bIsAscii = isAscii(b.name)
        if (aIsAscii && !bIsAscii) {
          cmp = -1
        } else if (!aIsAscii && bIsAscii) {
          cmp = 1
        } else {
          cmp = a.name.localeCompare(b.name, 'zh-CN')
        }
      } else if (sortField === 'createdAt') {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      } else if (sortField === 'updatedAt') {
        cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
      }
      return sortDirection === 'asc' ? cmp : -cmp
    })
  }, [folders, sortField, sortDirection])

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
    if (selectedIds.size === folders.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(folders.map((f) => f.id)))
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

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return

    setError(null)
    setIsDeleting(true)
    try {
      await deleteFolders(Array.from(selectedIds))
      setSelectedIds(new Set())
      await refetch()
      queryClient.invalidateQueries({ queryKey: ['feeds'] })
      queryClient.invalidateQueries({ queryKey: ['unreadCounts'] })
    } catch {
      setError('删除失败')
    } finally {
      setIsDeleting(false)
    }
  }

  const isAllSelected = folders.length > 0 && selectedIds.size === folders.length
  const isPartialSelected = selectedIds.size > 0 && selectedIds.size < folders.length

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
          文件夹 ({folders.length})
        </h3>
        <div className="flex items-center gap-2">
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
            <span>{isDeleting ? '删除中...' : `删除 (${selectedIds.size})`}</span>
          </button>
        </div>
      </div>

      {/* Warning */}
      <div className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
        删除文件夹会同时删除其中的所有订阅源及文章
      </div>

      {/* Error message */}
      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Table */}
      {folders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center">
          <p className="text-sm text-muted-foreground">暂无文件夹</p>
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
                    onClick={() => handleSort('name')}
                    className="flex items-center hover:text-foreground transition-colors"
                  >
                    名称
                    <SortIcon field="name" />
                  </button>
                </th>
                <th className="w-28 px-3 py-2 text-left font-medium text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => handleSort('createdAt')}
                    className="flex items-center hover:text-foreground transition-colors"
                  >
                    创建日期
                    <SortIcon field="createdAt" />
                  </button>
                </th>
                <th className="w-36 px-3 py-2 text-left font-medium text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => handleSort('updatedAt')}
                    className="flex items-center hover:text-foreground transition-colors"
                  >
                    最后更新
                    <SortIcon field="updatedAt" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedFolders.map((folder: Folder) => {
                const isSelected = selectedIds.has(folder.id)
                return (
                  <tr
                    key={folder.id}
                    className={cn(
                      'transition-colors',
                      isSelected ? 'bg-primary/5' : 'hover:bg-muted/30'
                    )}
                  >
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => handleSelect(folder.id)}
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
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="flex size-4 items-center justify-center rounded bg-muted text-muted-foreground">
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
                              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                            />
                          </svg>
                        </div>
                        <span className="truncate font-medium" title={folder.name}>
                          {folder.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatDate(folder.createdAt)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatDateTime(folder.updatedAt)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
