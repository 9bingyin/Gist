import { useCallback, useRef } from "react";
import { useLongPress } from "./useLongPress";

interface UseContextMenuOptions {
  onContextMenu: (
    e: React.MouseEvent | { pageX: number; pageY: number; target: EventTarget },
  ) => void;
  onTouchStart?: (e: React.TouchEvent) => void;
  onTouchMove?: (e: React.TouchEvent) => void;
  onTouchEnd?: (e: React.TouchEvent) => void;
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
  });

  return {
    ...longPressProps,
    onContextMenu,
  };
}

/**
 * Shared helper for Radix ContextMenuTrigger elements that bridges mobile long-press
 * into a synthetic `contextmenu` MouseEvent on the trigger node.
 */
export function useContextMenuTrigger<T extends HTMLElement>() {
  const triggerRef = useRef<T>(null);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent | { pageX: number; pageY: number }) => {
      if (!("button" in e) && triggerRef.current) {
        triggerRef.current.dispatchEvent(
          new MouseEvent("contextmenu", {
            bubbles: true,
            clientX: e.pageX,
            clientY: e.pageY,
          }),
        );
      }
    },
    [],
  );

  const contextMenuProps = useContextMenu({
    onContextMenu: handleContextMenu,
  });

  return { triggerRef, contextMenuProps };
}
