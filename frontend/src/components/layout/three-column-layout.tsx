import {
  type ReactNode,
  useMemo,
  useRef,
  useEffect,
  useCallback,
  useState,
} from "react";
import { PanelSplitter } from "@/components/ui/panel-splitter";
import { cn } from "@/lib/utils";
import {
  getUISettings,
  setUISetting,
  defaultUISettings,
  useUISettingKey,
} from "@/hooks/useUISettings";

const FEED_COL_MIN = 256;
const FEED_COL_MAX = 300;
const ENTRY_COL_MIN = 300;

interface UseResizableOptions {
  axis: "x" | "y";
  initial: number;
  min: number;
  max: number;
  onResizeEnd?: (position: number) => void;
}

function useResizable({
  axis,
  initial,
  min,
  max,
  onResizeEnd,
}: UseResizableOptions) {
  const [override, setOverride] = useState<{
    base: number;
    value: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const startPosRef = useRef(0);
  const startValueRef = useRef(0);

  const position =
    override && override.base === initial ? override.value : initial;
  const positionRef = useRef(position);
  const onResizeEndRef = useRef(onResizeEnd);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    onResizeEndRef.current = onResizeEnd;
  }, [onResizeEnd]);

  const setPosition = useCallback(
    (next: number) => {
      positionRef.current = next;
      setOverride({ base: initial, value: next });
    },
    [initial],
  );

  const getEventPosition = useCallback(
    (e: MouseEvent | PointerEvent | TouchEvent) => {
      if ("touches" in e && e.touches.length > 0) {
        return axis === "x" ? e.touches[0]!.clientX : e.touches[0]!.clientY;
      }
      return axis === "x"
        ? (e as MouseEvent).clientX
        : (e as MouseEvent).clientY;
    },
    [axis],
  );

  const handleDragStart = useCallback(
    (e: React.PointerEvent | React.TouchEvent) => {
      e.preventDefault();
      setIsDragging(true);
      const pos = getEventPosition(e.nativeEvent as PointerEvent | TouchEvent);
      startPosRef.current = pos;
      startValueRef.current = positionRef.current;
    },
    [getEventPosition],
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: MouseEvent | PointerEvent | TouchEvent) => {
      const currentPos = getEventPosition(e);
      const delta = currentPos - startPosRef.current;
      const newValue = Math.min(
        max,
        Math.max(min, startValueRef.current + delta),
      );
      positionRef.current = newValue;
      setPosition(newValue);
    };

    const handleEnd = () => {
      setIsDragging(false);
      onResizeEndRef.current?.(positionRef.current);
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      handleMove(e);
    };

    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleEnd);
    document.addEventListener("pointercancel", handleEnd);
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleEnd);
    document.addEventListener("touchcancel", handleEnd);

    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleEnd);
      document.removeEventListener("pointercancel", handleEnd);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleEnd);
      document.removeEventListener("touchcancel", handleEnd);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isDragging, min, max, getEventPosition, setPosition]);

  return {
    position,
    isDragging,
    separatorProps: {
      onPointerDown: handleDragStart,
      onTouchStart: handleDragStart,
    },
    setPosition,
  };
}

interface ThreeColumnLayoutProps {
  sidebar?: ReactNode;
  list?: ReactNode;
  content?: ReactNode;
  className?: string;
  hideList?: boolean;
  showSidebar?: boolean;
}

export function ThreeColumnLayout({
  sidebar,
  list,
  content,
  className,
  hideList = false,
  showSidebar = true,
}: ThreeColumnLayoutProps) {
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1200,
  );

  const storedFeedColWidth = useUISettingKey("feedColWidth");

  const entryColMax = useMemo(() => {
    const sidebarWidth = showSidebar ? storedFeedColWidth : 0;
    return Math.max(
      ENTRY_COL_MIN,
      Math.floor((windowWidth - sidebarWidth - 12) / 2),
    );
  }, [windowWidth, storedFeedColWidth, showSidebar]);

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const feedColInitial = useMemo(() => getUISettings().feedColWidth, []);
  const entryColInitial = useMemo(() => {
    const stored = getUISettings().entryColWidth;
    return Math.min(Math.max(stored, ENTRY_COL_MIN), entryColMax);
  }, [entryColMax]);

  const feedColResizable = useResizable({
    axis: "x",
    initial: feedColInitial,
    min: FEED_COL_MIN,
    max: FEED_COL_MAX,
    onResizeEnd: (position) => {
      setUISetting("feedColWidth", position);
    },
  });

  const entryColResizable = useResizable({
    axis: "x",
    initial: entryColInitial,
    min: ENTRY_COL_MIN,
    max: entryColMax,
    onResizeEnd: (position) => {
      setUISetting("entryColWidth", position);
    },
  });

  const handleFeedColDoubleClick = useCallback(() => {
    setUISetting("feedColWidth", defaultUISettings.feedColWidth);
    feedColResizable.setPosition(defaultUISettings.feedColWidth);
  }, [feedColResizable]);

  const handleEntryColDoubleClick = useCallback(() => {
    setUISetting("entryColWidth", defaultUISettings.entryColWidth);
    entryColResizable.setPosition(defaultUISettings.entryColWidth);
  }, [entryColResizable]);

  return (
    <div
      className={cn("flex h-full w-screen overflow-hidden", className)}
      style={
        {
          "--feed-col-width": `${feedColResizable.position}px`,
          "--entry-col-width": `${entryColResizable.position}px`,
        } as React.CSSProperties
      }
    >
      {/* Sidebar - left column (Feed list) */}
      <aside
        className={cn(
          "flex h-full shrink-0 flex-col overflow-hidden bg-sidebar safe-area-top safe-area-left",
          "ease-[var(--ease-ios)]",
          !feedColResizable.isDragging && "motion-reduce:transition-none",
          !feedColResizable.isDragging &&
            "transition-[width,opacity,transform]",
          showSidebar
            ? "opacity-100 translate-x-0 w-[calc(var(--feed-col-width)+env(safe-area-inset-left,0px))] duration-[var(--duration-sidebar-expand)]"
            : "w-0 opacity-0 -translate-x-2 pointer-events-none duration-[var(--duration-sidebar-collapse)]",
        )}
      >
        {sidebar}
      </aside>

      {/* First splitter */}
      <div
        className={cn(
          "relative h-full shrink-0 z-30 ease-[var(--ease-ios)]",
          !feedColResizable.isDragging && "motion-reduce:transition-none",
          !feedColResizable.isDragging && "transition-[width,opacity]",
          showSidebar
            ? "w-0 opacity-100 duration-[var(--duration-sidebar-expand)]"
            : "w-0 opacity-0 pointer-events-none duration-[var(--duration-sidebar-collapse)]",
        )}
      >
        {showSidebar && (
          <PanelSplitter
            isDragging={feedColResizable.isDragging}
            onPointerDown={feedColResizable.separatorProps.onPointerDown}
            onTouchStart={feedColResizable.separatorProps.onTouchStart}
            onDoubleClick={handleFeedColDoubleClick}
          />
        )}
      </div>

      {/* List - middle column (Entry list) */}
      {!hideList && (
        <>
          <div
            className={cn(
              "flex h-full shrink-0 flex-col overflow-hidden bg-background safe-area-top w-[var(--entry-col-width)]",
              !entryColResizable.isDragging &&
                "transition-[width] duration-200",
            )}
          >
            {list}
          </div>

          <PanelSplitter
            isDragging={entryColResizable.isDragging}
            onPointerDown={entryColResizable.separatorProps.onPointerDown}
            onTouchStart={entryColResizable.separatorProps.onTouchStart}
            onDoubleClick={handleEntryColDoubleClick}
          />
        </>
      )}

      {/* Content - right column (Entry content) */}
      <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-background safe-area-top">
        {content}
      </main>
    </div>
  );
}
