import { useRef, useEffect } from "react";

export type SwipeDirection = "left" | "right" | "up" | "down";

interface UseSwipeGestureOptions {
  onSwipe?: (direction: SwipeDirection) => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  threshold?: number;
  velocityThreshold?: number;
  enabledDirections?: SwipeDirection[];
  preventScroll?: boolean;
  startFrom?: {
    left?: number;
    right?: number;
    top?: number;
    bottom?: number;
  };
  enabled?: boolean;
}

interface TouchState {
  startX: number;
  startY: number;
  startTime: number;
  currentX: number;
  currentY: number;
  isScrolling: boolean | null;
}

const DIRECTION_LOCK_RATIO = 1.2;
const DEFAULT_DIRECTIONS: SwipeDirection[] = ["left", "right", "up", "down"];

export function useSwipeGesture(
  elementRef: React.RefObject<HTMLElement | null>,
  options: UseSwipeGestureOptions = {},
) {
  const enabled = options.enabled ?? true;
  const optionsRef = useRef(options);
  const touchState = useRef<TouchState | null>(null);

  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    const element = elementRef.current;
    if (!element || !enabled) {
      touchState.current = null;
      return;
    }

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;

      const { startFrom } = optionsRef.current;
      if (startFrom) {
        const rect = element.getBoundingClientRect();
        const withinLeft =
          startFrom.left === undefined ||
          touch.clientX <= rect.left + startFrom.left;
        const withinRight =
          startFrom.right === undefined ||
          touch.clientX >= rect.right - startFrom.right;
        const withinTop =
          startFrom.top === undefined ||
          touch.clientY <= rect.top + startFrom.top;
        const withinBottom =
          startFrom.bottom === undefined ||
          touch.clientY >= rect.bottom - startFrom.bottom;

        if (!withinLeft || !withinRight || !withinTop || !withinBottom) {
          touchState.current = null;
          return;
        }
      }

      touchState.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        startTime: Date.now(),
        currentX: touch.clientX,
        currentY: touch.clientY,
        isScrolling: null,
      };
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchState.current) return;

      const touch = e.touches[0];
      if (!touch) return;

      touchState.current.currentX = touch.clientX;
      touchState.current.currentY = touch.clientY;

      if (touchState.current.isScrolling === null) {
        const deltaX = Math.abs(touch.clientX - touchState.current.startX);
        const deltaY = Math.abs(touch.clientY - touchState.current.startY);

        if (deltaX > 10 || deltaY > 10) {
          if (deltaX > deltaY * DIRECTION_LOCK_RATIO) {
            touchState.current.isScrolling = false;
          } else if (deltaY > deltaX * DIRECTION_LOCK_RATIO) {
            touchState.current.isScrolling = true;
          }
        }
      }

      const { preventScroll = true, enabledDirections = DEFAULT_DIRECTIONS } =
        optionsRef.current;

      if (
        preventScroll &&
        touchState.current.isScrolling === false &&
        (enabledDirections.includes("left") ||
          enabledDirections.includes("right"))
      ) {
        e.preventDefault();
      }
    };

    const handleTouchEnd = () => {
      if (!touchState.current) return;

      if (touchState.current.isScrolling === true) {
        touchState.current = null;
        return;
      }

      const {
        threshold = 50,
        velocityThreshold = 0.3,
        enabledDirections = DEFAULT_DIRECTIONS,
        onSwipe,
        onSwipeLeft,
        onSwipeRight,
        onSwipeUp,
        onSwipeDown,
      } = optionsRef.current;

      const deltaX = touchState.current.currentX - touchState.current.startX;
      const deltaY = touchState.current.currentY - touchState.current.startY;
      const deltaTime = Math.max(1, Date.now() - touchState.current.startTime);

      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      const velocity = Math.max(absX, absY) / deltaTime;

      let direction: SwipeDirection | null = null;

      if (absX > absY * DIRECTION_LOCK_RATIO) {
        if (absX > threshold || velocity > velocityThreshold) {
          if (deltaX > 0 && enabledDirections.includes("right")) {
            direction = "right";
            onSwipeRight?.();
          } else if (deltaX < 0 && enabledDirections.includes("left")) {
            direction = "left";
            onSwipeLeft?.();
          }
        }
      } else if (absY > absX * DIRECTION_LOCK_RATIO) {
        if (absY > threshold || velocity > velocityThreshold) {
          if (deltaY > 0 && enabledDirections.includes("down")) {
            direction = "down";
            onSwipeDown?.();
          } else if (deltaY < 0 && enabledDirections.includes("up")) {
            direction = "up";
            onSwipeUp?.();
          }
        }
      }

      if (direction) {
        onSwipe?.(direction);
      }

      touchState.current = null;
    };

    const handleTouchCancel = () => {
      touchState.current = null;
    };

    element.addEventListener("touchstart", handleTouchStart, { passive: true });
    element.addEventListener("touchmove", handleTouchMove, { passive: false });
    element.addEventListener("touchend", handleTouchEnd, { passive: true });
    element.addEventListener("touchcancel", handleTouchCancel, {
      passive: true,
    });

    return () => {
      touchState.current = null;
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchmove", handleTouchMove);
      element.removeEventListener("touchend", handleTouchEnd);
      element.removeEventListener("touchcancel", handleTouchCancel);
    };
  }, [elementRef, enabled]);
}
