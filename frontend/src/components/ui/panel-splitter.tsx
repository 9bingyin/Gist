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
    <div
      className={cn(
        'group relative flex w-1.5 shrink-0 cursor-ew-resize items-center justify-center',
        'hover:bg-accent/50 transition-colors duration-150',
        isDragging && 'bg-accent',
        className
      )}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      title={tooltip}
    >
      <div
        className={cn(
          'h-8 w-0.5 rounded-full bg-border transition-all duration-150',
          'group-hover:h-12 group-hover:bg-muted-foreground/50',
          isDragging && 'h-12 bg-primary'
        )}
      />
    </div>
  )
}
