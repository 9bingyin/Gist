import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('app shell viewport sizing', () => {
  const appSource = readFileSync('src/App.tsx', 'utf8')
  const cssSource = readFileSync('src/index.css', 'utf8')

  it('wraps the app in a fixed-height shell', () => {
    expect(appSource).toContain('className="app-shell"')
    expect(cssSource).toContain('.app-shell')
    expect(cssSource).toContain('height: 100%;')
  })

  it('uses large viewport height in standalone PWA mode', () => {
    expect(cssSource).toContain('@media (display-mode: standalone)')
    expect(cssSource).toContain('--app-dvh: 100lvh;')
  })
})
