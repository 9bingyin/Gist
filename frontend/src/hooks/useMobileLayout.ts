import { useState, useEffect, useCallback, useMemo } from 'react'
import { useLocation, useSearch } from 'wouter'
import { parseRoute } from '@/lib/router'

export type MobileView = 'list' | 'detail'

const MOBILE_BREAKPOINT = 768

export function useMobileLayout() {
  const [location] = useLocation()
  const search = useSearch()
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false
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
      setIsMobile(mobile)
      if (!mobile) {
        setSidebarOpen(false)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // showDetail is now a no-op - view is controlled by URL (entryId)
  const showDetail = useCallback(() => {
    // View changes automatically when entryId is set in URL
  }, [])

  // showList navigates back to remove entryId from URL
  const showList = useCallback(() => {
    window.history.back()
  }, [])

  const openSidebar = useCallback(() => setSidebarOpen(true), [])
  const closeSidebar = useCallback(() => setSidebarOpen(false), [])

  return {
    isMobile,
    mobileView,
    sidebarOpen,
    setSidebarOpen,
    showDetail,
    showList,
    openSidebar,
    closeSidebar,
  }
}
