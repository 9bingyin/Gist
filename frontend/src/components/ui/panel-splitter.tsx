import { cn } from '@/lib/utils'

interface PanelSplitterProps {
  isDragging?: boolean
  onMouseDown?: (e: React.MouseEvent) => void
  onDoubleClick?: () => void
  className?: string
  tooltip?: string
}

export function PanelSplitter({
  isDragging,
  onMouseDown,
  onDoubleClick,
  className,
  tooltip,
}: PanelSplitterProps) {
  return (
    <div className={cn('relative h-full w-0 shrink-0 z-30', className)}>
      <div
        className={cn(
          'absolute inset-y-0 -left-1 w-2 cursor-ew-resize flex items-center justify-center transition-colors duration-200 group',
          isDragging && 'bg-accent/30'
        )}
        onMouseDown={onMouseDown}
        onDoubleClick={onDoubleClick}
        title={tooltip}
      >
        <div
          className={cn(
            'w-[1px] h-full bg-transparent transition-colors duration-200',
            'group-hover:bg-gray-300 group-hover:dark:bg-neutral-600',
            isDragging && 'bg-primary'
          )}
        />
      </div>
    </div>
  )
}
