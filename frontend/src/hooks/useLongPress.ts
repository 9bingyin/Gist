import { useRef, useCallback, useEffect } from "react";

interface UseLongPressOptions {
  onLongPress: (e: {
    pageX: number;
    pageY: number;
    target: EventTarget;
  }) => void;
  onClick?: (e: React.TouchEvent) => void;
  onTouchMove?: (e: React.TouchEvent) => void;
  onTouchEnd?: (e: React.TouchEvent) => void;
  onTouchStart?: (e: React.TouchEvent) => void;
  onTouchCancel?: (e: React.TouchEvent) => void;
  threshold?: number;
}

/**
 * Hook for detecting long press on touch devices.
 * Returns touch event handlers that can be spread onto an element.
 */
export function useLongPress(options: UseLongPressOptions) {
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isLongPress = useRef(false);
  const startPosition = useRef<{ x: number; y: number } | undefined>(undefined);

  useEffect(() => {
    return () => {
      clearTimeout(timerRef.current);
    };
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const {
      onTouchStart: userTouchStart,
      onLongPress,
      threshold = 500,
    } = optionsRef.current;
    userTouchStart?.(e);
    isLongPress.current = false;
    const touch = e.touches[0];
    if (!touch) return;

    clearTimeout(timerRef.current);
    const target = e.target;
    const clientX = touch.clientX;
    const clientY = touch.clientY;
    startPosition.current = {
      x: clientX + window.scrollX,
      y: clientY + window.scrollY,
    };

    timerRef.current = setTimeout(() => {
      isLongPress.current = true;
      if (!startPosition.current) return;

      onLongPress({
        pageX: startPosition.current.x,
        pageY: startPosition.current.y,
        target,
      });
    }, threshold);
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    optionsRef.current.onTouchMove?.(e);
    if (!startPosition.current) return;

    const touch = e.touches[0];
    if (!touch) return;

    const currentX = touch.clientX + window.scrollX;
    const currentY = touch.clientY + window.scrollY;

    const moveOffset = Math.hypot(
      currentX - startPosition.current.x,
      currentY - startPosition.current.y,
    );

    if (moveOffset > 10) {
      clearTimeout(timerRef.current);
      startPosition.current = undefined;
    }
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    optionsRef.current.onTouchEnd?.(e);
    clearTimeout(timerRef.current);
    if (!isLongPress.current && optionsRef.current.onClick) {
      optionsRef.current.onClick(e);
    }
    startPosition.current = undefined;
  }, []);

  const onTouchCancel = useCallback((e: React.TouchEvent) => {
    optionsRef.current.onTouchCancel?.(e);
    clearTimeout(timerRef.current);
    isLongPress.current = false;
    startPosition.current = undefined;
  }, []);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
  };
}
