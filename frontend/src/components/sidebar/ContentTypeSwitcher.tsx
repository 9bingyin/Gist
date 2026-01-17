import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { FileTextIcon, ImageIcon, BellIcon } from '@/components/ui/icons'
import type { ContentType } from '@/types/api'

interface ContentTypeSwitcherProps {
  contentType: ContentType
  counts: { article: number; picture: number; notification: number }
  onSelect: (type: ContentType) => void
  visibleContentTypes: ContentType[]
}

const contentTypeMeta: Record<ContentType, { icon: typeof FileTextIcon; labelKey: string }> = {
  article: { icon: FileTextIcon, labelKey: 'content_type.article' },
  picture: { icon: ImageIcon, labelKey: 'content_type.picture' },
  notification: { icon: BellIcon, labelKey: 'content_type.notification' },
}

export function ContentTypeSwitcher({
  contentType,
  counts,
  onSelect,
  visibleContentTypes,
}: ContentTypeSwitcherProps) {
  const { t } = useTranslation()

  return (
    <div className="relative mb-2 mt-3">
      <div className="flex h-11 items-center px-1 text-xl text-muted-foreground">
        {visibleContentTypes.map((type) => {
          const { icon: Icon, labelKey } = contentTypeMeta[type]
          return (
            <button
              key={type}
              onClick={() => onSelect(type)}
              className={cn(
                'flex h-11 w-8 shrink-0 grow flex-col items-center justify-center gap-1 rounded-md transition-colors',
                contentType === type
                  ? 'text-lime-600 dark:text-lime-500'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              title={t(labelKey)}
            >
              <Icon className="size-[1.375rem]" />
              <div className="text-[0.625rem] font-medium leading-none">
                {counts[type]}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
