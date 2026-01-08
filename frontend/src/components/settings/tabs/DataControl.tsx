import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { startImportOPML, watchImportStatus, cancelImportOPML, exportOPML, clearAICache } from '@/api'
import type { ClearAICacheResponse } from '@/api'
import { cn } from '@/lib/utils'
import type { ImportResult, ImportTask } from '@/types/api'

export function DataControl() {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [task, setTask] = useState<ImportTask | null>(null)

  const [isClearing, setIsClearing] = useState(false)
  const [clearResult, setClearResult] = useState<ClearAICacheResponse | null>(null)
  const [clearError, setClearError] = useState<string | null>(null)

  const isImporting = task?.status === 'running'

  // Connect to SSE on mount to get current import status
  useEffect(() => {
    const cancel = watchImportStatus((t) => {
      setTask(t)

      if (t.status === 'done' && t.result) {
        setImportResult(t.result)
        // Invalidate queries to refresh feed list
        queryClient.invalidateQueries({ queryKey: ['folders'] })
        queryClient.invalidateQueries({ queryKey: ['feeds'] })
        queryClient.invalidateQueries({ queryKey: ['unreadCounts'] })
      } else if (t.status === 'error') {
        setImportError(t.error || 'Import failed')
      }
    })

    return cancel
  }, [queryClient])

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImportResult(null)
    setImportError(null)
    setTask(null)

    try {
      await startImportOPML(file)
      // SSE connection is already established in useEffect on mount
      // No need to create another one here - it will receive the updates
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed'
      setImportError(message)
    } finally {
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleCancel = async () => {
    await cancelImportOPML()
  }

  const handleExport = async () => {
    try {
      await exportOPML()
    } catch {
      // Export error handled silently
    }
  }

  const handleClearAICache = async () => {
    setIsClearing(true)
    setClearResult(null)
    setClearError(null)

    try {
      const result = await clearAICache()
      setClearResult(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Clear failed'
      setClearError(message)
    } finally {
      setIsClearing(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Import Section */}
      <section>
        <h3 className="mb-4 text-sm font-semibold text-muted-foreground">{t('data_control.import_data')}</h3>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{t('data_control.import_feeds')}</div>
              <div className="text-xs text-muted-foreground">{t('data_control.import_description')}</div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".opml,.xml"
              className="hidden"
              onChange={handleFileChange}
            />

            <button
              type="button"
              onClick={handleImportClick}
              disabled={isImporting}
              className={cn(
                'inline-flex h-8 items-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium',
                'transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50'
              )}
            >
              {isImporting ? (
                <>
                  <svg className="size-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>{t('data_control.importing')}</span>
                </>
              ) : (
                <>
                  <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                    />
                  </svg>
                  <span>{t('data_control.select_file')}</span>
                </>
              )}
            </button>
          </div>

          {/* Import Progress */}
          {task && task.status === 'running' && task.total > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${(task.current / task.total) * 100}%` }}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {t('data_control.stop')}
                </button>
              </div>
              <div className="text-xs text-muted-foreground">
                {task.feed
                  ? `${task.feed} (${task.current}/${task.total})`
                  : `${task.current}/${task.total}`}
              </div>
            </div>
          )}

          {/* Import Cancelled */}
          {task && task.status === 'cancelled' && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm dark:border-yellow-900 dark:bg-yellow-950">
              <div className="font-medium text-yellow-800 dark:text-yellow-200">{t('data_control.import_stopped')}</div>
              <div className="mt-1 text-yellow-700 dark:text-yellow-300">
                {t('data_control.imported_progress', { current: task.current, total: task.total })}
              </div>
            </div>
          )}

          {/* Import Result */}
          {importResult && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm dark:border-green-900 dark:bg-green-950">
              <div className="font-medium text-green-800 dark:text-green-200">{t('data_control.import_success')}</div>
              <ul className="mt-1 space-y-0.5 text-green-700 dark:text-green-300">
                <li>{t('data_control.folders_created', { count: importResult.foldersCreated })}</li>
                <li>{t('data_control.feeds_created', { count: importResult.feedsCreated })}</li>
                {(importResult.foldersSkipped > 0 || importResult.feedsSkipped > 0) && (
                  <li className="text-green-600 dark:text-green-400">
                    {t('data_control.skipped_items', { foldersSkipped: importResult.foldersSkipped, feedsSkipped: importResult.feedsSkipped })}
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Import Error */}
          {importError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950">
              <div className="font-medium text-red-800 dark:text-red-200">{t('data_control.import_failed')}</div>
              <div className="mt-1 text-red-700 dark:text-red-300">{importError}</div>
            </div>
          )}
        </div>
      </section>

      {/* Export Section */}
      <section>
        <h3 className="mb-4 text-sm font-semibold text-muted-foreground">{t('data_control.export_data')}</h3>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{t('data_control.export_feeds')}</div>
              <div className="text-xs text-muted-foreground">{t('data_control.export_description')}</div>
            </div>

            <button
              type="button"
              onClick={handleExport}
              className={cn(
                'inline-flex h-8 items-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium',
                'transition-colors hover:bg-accent'
              )}
            >
              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              <span>{t('data_control.export')}</span>
            </button>
          </div>
        </div>
      </section>

      {/* Clear Cache Section */}
      <section>
        <h3 className="mb-4 text-sm font-semibold text-muted-foreground">{t('data_control.clear_cache')}</h3>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{t('data_control.clear_ai_cache')}</div>
              <div className="text-xs text-muted-foreground">{t('data_control.clear_ai_cache_description')}</div>
            </div>

            <button
              type="button"
              onClick={handleClearAICache}
              disabled={isClearing}
              className={cn(
                'inline-flex h-8 items-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium',
                'transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50'
              )}
            >
              {isClearing ? (
                <>
                  <svg className="size-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>{t('data_control.clearing')}</span>
                </>
              ) : (
                <>
                  <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                  <span>{t('data_control.clear')}</span>
                </>
              )}
            </button>
          </div>

          {/* Clear Result */}
          {clearResult && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm dark:border-green-900 dark:bg-green-950">
              <div className="font-medium text-green-800 dark:text-green-200">{t('data_control.clear_success')}</div>
              <div className="mt-1 text-green-700 dark:text-green-300">
                {t('data_control.cleared_items', {
                  summaries: clearResult.summaries,
                  translations: clearResult.translations + clearResult.listTranslations,
                })}
              </div>
            </div>
          )}

          {/* Clear Error */}
          {clearError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950">
              <div className="font-medium text-red-800 dark:text-red-200">{t('data_control.clear_failed')}</div>
              <div className="mt-1 text-red-700 dark:text-red-300">{clearError}</div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
