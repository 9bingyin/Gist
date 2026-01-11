import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { FileTextIcon, ImageIcon, BellIcon } from '@/components/ui/icons'
import type { ContentType } from '@/types/api'

interface ContentTypeSwitcherProps {
  contentType: ContentType
  counts: { article: number; picture: number; notification: number }
  onSelect: (type: ContentType) => void
}

const contentTypes: Array<{
  type: ContentType
  icon: typeof FileTextIcon
  labelKey: string
}> = [
  { type: 'article', icon: FileTextIcon, labelKey: 'content_type.article' },
  { type: 'picture', icon: ImageIcon, labelKey: 'content_type.picture' },
  { type: 'notification', icon: BellIcon, labelKey: 'content_type.notification' },
]

export function ContentTypeSwitcher({
  contentType,
  counts,
  onSelect,
}: ContentTypeSwitcherProps) {
  const { t } = useTranslation()

  return (
    <div className="relative mb-2 mt-3">
      <div className="flex h-11 items-center px-1 text-xl text-muted-foreground">
        {contentTypes.map(({ type, icon: Icon, labelKey }) => (
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
        ))}
      </div>
    </div>
  )
}
