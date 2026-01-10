import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, Edit2, Check, X } from 'lucide-react'
import {
  getDomainRateLimits,
  createDomainRateLimit,
  updateDomainRateLimit,
  deleteDomainRateLimit,
} from '@/api'
import type { DomainRateLimit } from '@/types/settings'
import { cn } from '@/lib/utils'

export function AdvancedSettings() {
  const { t } = useTranslation()
  const [items, setItems] = useState<DomainRateLimit[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Add state
  const [newHost, setNewHost] = useState('')
  const [newInterval, setNewInterval] = useState('')

  // Edit state
  const [editingHost, setEditingHost] = useState<string | null>(null)
  const [editInterval, setEditInterval] = useState<number>(0)

  const loadData = useCallback(async () => {
    try {
      const data = await getDomainRateLimits()
      setItems(data.items)
    } catch {
      // ignore
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const isValidHostFormat = (h: string) => {
    const trimmed = h.trim()
    if (!trimmed) return false
    if (trimmed === 'localhost') return true

    // IPv4 check
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
    if (ipv4Regex.test(trimmed)) return true

    // IPv6 check (simplified but robust enough for frontend)
    if (trimmed.includes(':')) {
      const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^(([0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{1,4})?::(([0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{1,4})?$/
      return ipv6Regex.test(trimmed)
    }

    // Domain check (RFC 1123, requires at least one dot)
    const domainRegex = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/
    return domainRegex.test(trimmed)
  }

  const handleCreate = async () => {
    if (!newHost.trim() || !isValidHostFormat(newHost)) return

    const interval = Math.max(0, parseInt(newInterval) || 0)
    try {
      await createDomainRateLimit(newHost.trim(), interval)
      setNewHost('')
      setNewInterval('')
      await loadData()
    } catch {
      // ignore
    }
  }

  const startEdit = (item: DomainRateLimit) => {
    setEditingHost(item.host)
    setEditInterval(item.intervalSeconds)
  }

  const cancelEdit = () => {
    setEditingHost(null)
    setEditInterval(0)
  }

  const handleUpdate = async () => {
    if (!editingHost) return
    try {
      await updateDomainRateLimit(editingHost, editInterval)
      setEditingHost(null)
      await loadData()
    } catch {
      // ignore
    }
  }

  const handleDelete = async (host: string) => {
    if (!confirm(t('settings.confirm_delete') || 'Are you sure?')) return
    try {
      await deleteDomainRateLimit(host)
      await loadData()
    } catch {
      // ignore
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Domain Rate Limits Section */}
      <section>
        <div className="mb-4">
          <div className="text-sm font-medium">{t('settings.advanced_domain_limits')}</div>
          <div className="text-xs text-muted-foreground">{t('settings.advanced_domain_limits_description')}</div>
        </div>

        <div className="space-y-2">
          {/* Add Row */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newHost}
              onChange={(e) => setNewHost(e.target.value)}
              placeholder="example.com"
              className={cn(
                'h-9 flex-1 rounded-md border border-border bg-background px-3 text-sm min-w-0',
                'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'
              )}
            />
            <div className="relative w-20 flex-shrink-0">
              <input
                type="number"
                min="0"
                value={newInterval}
                onChange={(e) => setNewInterval(e.target.value)}
                placeholder={t('settings.advanced_seconds')}
                className={cn(
                  'h-9 w-full rounded-md border border-border bg-background px-3 text-sm',
                  'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'
                )}
              />
            </div>
            <button
              type="button"
              onClick={handleCreate}
              disabled={!newHost.trim() || !isValidHostFormat(newHost)}
              className={cn(
                'flex size-9 flex-shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-secondary-foreground transition-colors hover:bg-secondary/80',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              <Plus className="size-4" />
            </button>
          </div>

          {/* List */}
          {items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {t('settings.advanced_no_domains')}
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => {
                const isEditing = editingHost === item.host
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 rounded-md border border-border bg-card p-2 min-w-0"
                  >
                    <div className="flex-1 px-2 text-sm font-mono truncate min-w-0" title={item.host}>
                      {item.host}
                    </div>

                    {isEditing ? (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <input
                          type="number"
                          min="0"
                          value={editInterval}
                          autoFocus
                          onChange={(e) => setEditInterval(Math.max(0, parseInt(e.target.value) || 0))}
                          className={cn(
                            'h-8 w-20 rounded-md border border-border bg-background px-2 text-sm',
                            'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'
                          )}
                        />
                        <button
                          type="button"
                          onClick={handleUpdate}
                          className="flex size-8 items-center justify-center rounded-md text-primary hover:bg-primary/10"
                        >
                          <Check className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <div className="w-20 text-center text-xs text-muted-foreground">
                          {item.intervalSeconds}s
                        </div>
                        <button
                          type="button"
                          onClick={() => startEdit(item)}
                          className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Edit2 className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item.host)}
                          className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
