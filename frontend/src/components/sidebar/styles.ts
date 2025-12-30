import { cn } from '@/lib/utils'

export const feedItemStyles = cn(
  'flex w-full cursor-pointer items-center rounded-md pr-2.5 h-8 gap-2',
  'text-sm font-medium leading-loose',
  'hover:bg-item-hover transition-colors duration-150',
  'data-[active=true]:bg-item-active'
)

export const sidebarItemIconStyles = cn(
  'shrink-0 size-4 flex items-center justify-center'
)
