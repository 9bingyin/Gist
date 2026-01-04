import { useLongPress } from './useLongPress'

interface UseContextMenuOptions {
  onContextMenu: (e: React.MouseEvent | { pageX: number; pageY: number; target: EventTarget }) => void
  onTouchStart?: (e: React.TouchEvent) => void
  onTouchMove?: (e: React.TouchEvent) => void
  onTouchEnd?: (e: React.TouchEvent) => void
}

/**
 * Hook that combines right-click (desktop) and long-press (mobile) context menu triggers.
 * Returns event handlers that can be spread onto an element.
 */
export function useContextMenu({
  onContextMenu,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}: UseContextMenuOptions) {
  const longPressProps = useLongPress({
    onLongPress: onContextMenu,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  })

  return {
    ...longPressProps,
    onContextMenu,
  }
}
