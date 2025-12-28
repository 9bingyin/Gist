import { cn } from '@/lib/utils'

export const feedItemStyles = cn(
  'flex w-full cursor-pointer items-center rounded-md px-2.5 h-8',
  'text-sm font-medium',
  'hover:bg-accent/50 transition-colors duration-150',
  'data-[active=true]:bg-accent'
)

export const categoryHeaderStyles = cn(
  'my-px flex w-full cursor-pointer items-center rounded-md px-2.5 h-8',
  'text-sm font-medium',
  'hover:bg-accent/50 transition-colors duration-150',
  'data-[active=true]:bg-accent'
)
