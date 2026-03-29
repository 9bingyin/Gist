import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useUpdateFeed } from '@/hooks/useFeeds'
import { cn } from '@/lib/utils'
import type { Feed } from '@/types/api'

const SUMMARY_PROMPT_REMINDER_MAX_LENGTH = 2000

interface EditFeedDialogProps {
  feed: Feed | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditFeedDialog({ feed, open, onOpenChange }: EditFeedDialogProps) {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const [summaryPromptReminder, setSummaryPromptReminder] = useState('')
  const [error, setError] = useState<string | null>(null)
  const updateFeed = useUpdateFeed()
  const reminderLength = Array.from(summaryPromptReminder).length
  const reminderTooLong = reminderLength > SUMMARY_PROMPT_REMINDER_MAX_LENGTH

  useEffect(() => {
    if (feed) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setTitle(feed.title)
      setSummaryPromptReminder(feed.summaryPromptReminder ?? '')
      setError(null)
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [feed])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!feed || !title.trim() || reminderTooLong) return

    setError(null)
    try {
      await updateFeed.mutateAsync({
        id: feed.id,
        title: title.trim(),
        folderId: feed.folderId,
        summaryPromptReminder,
      })
      onOpenChange(false)
    } catch {
      setError(t('feeds.update_failed'))
    }
  }

  const handleClose = () => {
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle>{t('feeds.edit_feed')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 p-4">
          <div className="space-y-2">
            <label htmlFor="feed-title-input" className="text-sm font-medium text-foreground">
              {t('feeds.feed_title')}
            </label>
            <input
              id="feed-title-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={cn(
                'w-full rounded-md border border-border bg-background px-3 py-2 text-sm',
                'focus:outline-none focus:ring-2 focus:ring-primary/50',
                'placeholder:text-muted-foreground'
              )}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              {t('feeds.feed_url')}
              <span className="ml-2 text-xs">({t('feeds.url_readonly')})</span>
            </label>
            <div
              className={cn(
                'w-full truncate rounded-md border border-border bg-muted/50 px-3 py-2 text-sm',
                'text-muted-foreground'
              )}
              title={feed?.url}
            >
              {feed?.url}
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-4">
              <label htmlFor="feed-summary-prompt-reminder" className="text-sm font-medium text-foreground">
                {t('feeds.summary_prompt_reminder')}
              </label>
              <span
                className={cn(
                  'text-xs',
                  reminderTooLong ? 'text-destructive' : 'text-muted-foreground'
                )}
              >
                {t('feeds.summary_prompt_reminder_count', {
                  count: reminderLength,
                  max: SUMMARY_PROMPT_REMINDER_MAX_LENGTH,
                })}
              </span>
            </div>
            <textarea
              id="feed-summary-prompt-reminder"
              value={summaryPromptReminder}
              onChange={(e) => setSummaryPromptReminder(e.target.value)}
              rows={6}
              className={cn(
                'min-h-28 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm',
                'focus:outline-none focus:ring-2 focus:ring-primary/50',
                'placeholder:text-muted-foreground'
              )}
            />
            {reminderTooLong && (
              <p className="text-xs text-destructive">
                {t('feeds.summary_prompt_reminder_too_long', {
                  max: SUMMARY_PROMPT_REMINDER_MAX_LENGTH,
                })}
              </p>
            )}
          </div>
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className={cn(
                'rounded-md px-4 py-2 text-sm font-medium transition-colors',
                'border border-border bg-background hover:bg-muted'
              )}
            >
              {t('actions.cancel')}
            </button>
            <button
              type="submit"
              disabled={!title.trim() || reminderTooLong || updateFeed.isPending}
              className={cn(
                'rounded-md px-4 py-2 text-sm font-medium transition-colors',
                'bg-primary text-primary-foreground hover:bg-primary/90',
                'disabled:cursor-not-allowed disabled:opacity-50'
              )}
            >
              {updateFeed.isPending ? t('settings.saving') : t('actions.save')}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
