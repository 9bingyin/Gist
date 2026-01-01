import { useState, useCallback, useRef, type FormEvent, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { normalizeUrl } from '@/lib/url'

interface FeedUrlFormProps {
  onSubmit: (url: string) => void
  isLoading?: boolean
}

export function FeedUrlForm({ onSubmit, isLoading = false }: FeedUrlFormProps) {
  const { t } = useTranslation()
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value)
  }, [])

  const handleSubmit = useCallback((e: FormEvent) => {
    e.preventDefault()
    if (!inputValue.trim() || isLoading) return

    const url = normalizeUrl(inputValue)
    if (url) {
      onSubmit(url)
    }
  }, [inputValue, isLoading, onSubmit])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (inputValue.trim() && !isLoading) {
        const url = normalizeUrl(inputValue)
        if (url) {
          onSubmit(url)
        }
      }
    }
  }, [inputValue, isLoading, onSubmit])

  const handleClear = useCallback(() => {
    setInputValue('')
    inputRef.current?.focus()
  }, [])

  return (
    <form onSubmit={handleSubmit} className="relative">
      <div className={cn(
        'flex items-center gap-2 rounded-xl border border-border',
        'bg-background px-4 py-2.5',
        'transition-colors duration-200',
        'focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20'
      )}>
        {/* RSS Icon */}
        <div className="shrink-0 text-muted-foreground">
          <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 5c7.18 0 13 5.82 13 13M6 11a7 7 0 017 7m-6 0a1 1 0 11-2 0 1 1 0 012 0z" />
          </svg>
        </div>

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="https://example.com/feed.xml"
          disabled={isLoading}
          className={cn(
            'flex-1 bg-transparent text-sm outline-none',
            'placeholder:text-muted-foreground/60',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />

        {/* Clear button */}
        {inputValue && !isLoading && (
          <button
            type="button"
            onClick={handleClear}
            className={cn(
              'shrink-0 rounded-md p-1',
              'text-muted-foreground hover:text-foreground',
              'transition-colors duration-200'
            )}
            aria-label={t('add_feed.clear_input')}
          >
            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* Submit button */}
        <button
          type="submit"
          disabled={!inputValue.trim() || isLoading}
          className={cn(
            'shrink-0 rounded-lg px-4 py-1.5',
            'bg-primary text-primary-foreground text-sm font-medium',
            'transition-all duration-200',
            'hover:bg-primary/90',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
        >
          {isLoading ? (
            <div className="flex items-center gap-2">
              <svg className="size-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>{t('add_feed.loading')}</span>
            </div>
          ) : (
            t('add_feed.add')
          )}
        </button>
      </div>
    </form>
  )
}
