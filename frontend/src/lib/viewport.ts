const APP_DVH_VAR = '--app-dvh'

type WindowWithViewport = Window & typeof globalThis

export function syncViewportHeight(
  target: HTMLElement = document.documentElement,
  win: WindowWithViewport = window,
): void {
  target.style.setProperty(APP_DVH_VAR, `${win.innerHeight}px`)
}

export function setupViewportHeightSync(
  win: WindowWithViewport = window,
  target: HTMLElement = document.documentElement,
): () => void {
  const update = () => {
    syncViewportHeight(target, win)
  }

  const handlePageShow = () => {
    update()
  }

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      update()
    }
  }

  update()

  win.addEventListener('resize', update)
  win.addEventListener('pageshow', handlePageShow)
  win.visualViewport?.addEventListener('resize', update)
  document.addEventListener('visibilitychange', handleVisibilityChange)

  return () => {
    win.removeEventListener('resize', update)
    win.removeEventListener('pageshow', handlePageShow)
    win.visualViewport?.removeEventListener('resize', update)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  }
}
