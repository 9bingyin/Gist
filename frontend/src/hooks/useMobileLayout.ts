import { useState, useEffect, useCallback } from 'react'

export type MobileView = 'list' | 'detail'

const MOBILE_BREAKPOINT = 768

export function useMobileLayout() {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false
  )
  const [mobileView, setMobileView] = useState<MobileView>('list')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT
      setIsMobile(mobile)
      // Reset to list view when switching to desktop
      if (!mobile) {
        setMobileView('list')
        setSidebarOpen(false)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const showDetail = useCallback(() => setMobileView('detail'), [])
  const showList = useCallback(() => setMobileView('list'), [])
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
