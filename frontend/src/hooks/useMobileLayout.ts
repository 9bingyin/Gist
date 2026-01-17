import { useState, useEffect, useCallback, useMemo } from 'react'
import { useLocation, useSearch } from 'wouter'
import { parseRoute, buildPath } from '@/lib/router'

export type MobileView = 'list' | 'detail'

const MOBILE_BREAKPOINT = 768
const TABLET_BREAKPOINT = 1366

export function useMobileLayout() {
  const [location, navigate] = useLocation()
  const search = useSearch()
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false
  )
  const [isTablet, setIsTablet] = useState(
    typeof window !== 'undefined' 
      ? window.innerWidth >= MOBILE_BREAKPOINT && window.innerWidth < TABLET_BREAKPOINT 
      : false
  )
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Mobile view is derived from URL - if there's an entryId, show detail
  const mobileView: MobileView = useMemo(() => {
    const routeState = parseRoute(location, search)
    return routeState.entryId ? 'detail' : 'list'
  }, [location, search])

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT
      const tablet = window.innerWidth >= MOBILE_BREAKPOINT && window.innerWidth < TABLET_BREAKPOINT
      setIsMobile(mobile)
      setIsTablet(tablet)
      if (!mobile) {
        setSidebarOpen(false)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Sync sidebar state on back navigation (iOS PWA swipe gesture / browser back)
  // This handles BFCache restoration and popstate events
  useEffect(() => {
    const handlePageShow = (e: PageTransitionEvent) => {
      // persisted = true means page was restored from BFCache
      if (e.persisted) {
        setSidebarOpen(false)
      }
    }
    const handlePopState = () => {
      setSidebarOpen(false)
    }

    window.addEventListener('pageshow', handlePageShow)
    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('pageshow', handlePageShow)
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

  // Navigate back to list by removing entryId from URL
  const showList = useCallback(() => {
    const routeState = parseRoute(location, search)
    navigate(buildPath(
      routeState.selection,
      null, // Remove entryId
      routeState.unreadOnly,
      routeState.contentType
    ))
  }, [location, search, navigate])

  const openSidebar = useCallback(() => setSidebarOpen(true), [])
  const closeSidebar = useCallback(() => setSidebarOpen(false), [])

  return {
    isMobile,
    isTablet,
    mobileView,
    sidebarOpen,
    setSidebarOpen,
    showList,
    openSidebar,
    closeSidebar,
  }
}
