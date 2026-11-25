import { useState, useEffect, useCallback } from "react";
import { useBreakpoint } from "@/hooks/useIsMobile";

export type MobileView = "list" | "detail";

interface UseMobileLayoutOptions {
  selectedEntryId: string | null;
  onClearEntry: () => void;
}

export function useMobileLayout({
  selectedEntryId,
  onClearEntry,
}: UseMobileLayoutOptions) {
  const { isMobile, isTablet } = useBreakpoint();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const mobileView: MobileView = selectedEntryId ? "detail" : "list";

  useEffect(() => {
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        setSidebarOpen(false);
      }
    };
    const handlePopState = () => {
      setSidebarOpen(false);
    };

    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return {
    isMobile,
    isTablet,
    mobileView,
    sidebarOpen: isMobile && sidebarOpen,
    setSidebarOpen,
    showList: onClearEntry,
    openSidebar,
    closeSidebar,
  };
}
