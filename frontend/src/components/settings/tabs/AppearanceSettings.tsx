import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Reorder } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useTheme, type Theme } from '@/hooks/useTheme'
import { useAppearanceSettings } from '@/hooks/useAppearanceSettings'
import { updateAppearanceSettings } from '@/api'
import { cn } from '@/lib/utils'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { FileTextIcon, ImageIcon, BellIcon, EyeOffIcon } from '@/components/ui/icons'
import type { ContentType } from '@/types/api'

const defaultContentTypes: ContentType[] = ['article', 'picture', 'notification']

export function AppearanceSettings() {
  const { t } = useTranslation()
  const { theme, setTheme } = useTheme()
  const queryClient = useQueryClient()
  const { data: appearanceSettings } = useAppearanceSettings()

  const themeOptions = useMemo(() => [
    {
      value: 'system' as Theme,
      label: (
        <>
          <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
          <span>{t('theme.system')}</span>
        </>
      ),
    },
    {
      value: 'light' as Theme,
      label: (
        <>
          <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
            />
          </svg>
          <span>{t('theme.light')}</span>
        </>
      ),
    },
    {
      value: 'dark' as Theme,
      label: (
        <>
          <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
            />
          </svg>
          <span>{t('theme.dark')}</span>
        </>
      ),
    },
  ], [t])

  const enabledContentTypes = useMemo(() => {
    const current = appearanceSettings?.contentTypes
    if (!current || current.length === 0) return defaultContentTypes
    return current.filter((item) => item === 'article' || item === 'picture' || item === 'notification')
  }, [appearanceSettings])

  const disabledContentTypes = useMemo(() => {
    return defaultContentTypes.filter((type) => !enabledContentTypes.includes(type))
  }, [enabledContentTypes])

  const [orderedTypes, setOrderedTypes] = useState<ContentType[]>(enabledContentTypes)

  useEffect(() => {
    setOrderedTypes(enabledContentTypes)
  }, [enabledContentTypes])

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const saveContentTypes = useCallback((nextTypes: ContentType[]) => {
    if (nextTypes.length === 0) return
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await updateAppearanceSettings({ contentTypes: nextTypes })
        queryClient.invalidateQueries({ queryKey: ['appearanceSettings'] })
      } catch {
        // ignore
      }
    }, 150)
  }, [queryClient])

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  const handleRemoveType = useCallback((type: ContentType) => {
    if (orderedTypes.length <= 1) return
    const nextTypes = orderedTypes.filter((item) => item !== type)
    setOrderedTypes(nextTypes)
    saveContentTypes(nextTypes)
  }, [orderedTypes, saveContentTypes])

  const handleAddType = useCallback((type: ContentType) => {
    const nextTypes = [...orderedTypes, type]
    setOrderedTypes(nextTypes)
    saveContentTypes(nextTypes)
  }, [orderedTypes, saveContentTypes])

  const handleReorder = useCallback((nextTypes: ContentType[]) => {
    setOrderedTypes(nextTypes)
    saveContentTypes(nextTypes)
  }, [saveContentTypes])

  const contentTypeMeta: Record<ContentType, { label: string; icon: ReactNode }> = useMemo(() => ({
    article: { label: t('content_type.article'), icon: <FileTextIcon className="size-4" /> },
    picture: { label: t('content_type.picture'), icon: <ImageIcon className="size-4" /> },
    notification: { label: t('content_type.notification'), icon: <BellIcon className="size-4" /> },
  }), [t])

  return (
    <div className="space-y-6">
      {/* Theme Section */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium">{t('theme.label')}</div>
            <div className="text-xs text-muted-foreground">{t('theme.description')}</div>
          </div>
          <SegmentedControl
            className="shrink-0"
            value={theme}
            onValueChange={setTheme}
            options={themeOptions}
          />
        </div>
      </section>

      {/* Category View Section */}
      <section>
        <div className="mb-3">
          <div className="text-sm font-medium">{t('settings.appearance_categories')}</div>
          <div className="text-xs text-muted-foreground">{t('settings.appearance_categories_description')}</div>
        </div>

        <div className="space-y-3">
          {/* Horizontal draggable chips */}
          <div className="flex flex-wrap gap-2">
            <Reorder.Group
              axis="x"
              values={orderedTypes}
              onReorder={handleReorder}
              className="flex flex-wrap gap-2"
              aria-label={t('settings.appearance_categories')}
            >
              {orderedTypes.map((type) => {
                const meta = contentTypeMeta[type]
                const isOnlyOne = orderedTypes.length <= 1
                return (
                  <Reorder.Item
                    key={type}
                    value={type}
                    drag="x"
                    dragElastic={0}
                    dragTransition={{ bounceStiffness: 600, bounceDamping: 50 }}
                    transition={{ duration: 0.15 }}
                    className={cn(
                      'flex cursor-grab items-center gap-2 rounded-lg border border-border/60 bg-card px-3 py-2',
                      'hover:border-border hover:shadow-sm',
                      'active:cursor-grabbing active:shadow-md active:z-10'
                    )}
                    aria-roledescription={t('settings.appearance_drag')}
                  >
                    {/* Icon */}
                    <span className="text-muted-foreground">{meta.icon}</span>
                    {/* Label */}
                    <span className="text-sm font-medium">{meta.label}</span>
                    {/* Hide button */}
                    {!isOnlyOne && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveType(type)
                        }}
                        className={cn(
                          'ml-1 flex size-5 items-center justify-center rounded-md',
                          'text-muted-foreground/50 transition-colors',
                          'hover:bg-destructive/10 hover:text-destructive'
                        )}
                        title={t('settings.appearance_hide')}
                      >
                        <EyeOffIcon className="size-3.5" />
                      </button>
                    )}
                  </Reorder.Item>
                )
              })}
            </Reorder.Group>
          </div>

          {/* Hidden types */}
          {disabledContentTypes.length > 0 && (
            <div>
              <div className="mb-2 text-xs text-muted-foreground">
                {t('settings.appearance_hidden')}
              </div>
              <div className="flex flex-wrap gap-2">
                {disabledContentTypes.map((type) => {
                  const meta = contentTypeMeta[type]
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleAddType(type)}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border border-dashed border-border/50 px-3 py-2',
                        'text-muted-foreground/60 transition-colors',
                        'hover:border-primary/50 hover:bg-primary/5 hover:text-foreground'
                      )}
                    >
                      <span>{meta.icon}</span>
                      <span className="text-sm font-medium">{meta.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {orderedTypes.length <= 1 && (
            <div className="text-xs text-muted-foreground">
              {t('settings.appearance_keep_one')}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
