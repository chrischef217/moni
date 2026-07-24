'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

function applyView(pathname: string) {
  const appContent = document.querySelector<HTMLElement>('[data-moni-app-content]')
  if (!appContent) return

  let view = ''
  if (pathname === '/audit') view = 'audit'
  else if (pathname === '/settings/appearance') view = 'appearance'
  else if (pathname === '/' && new URLSearchParams(window.location.search).get('legacy') === '1') view = 'legacy'

  if (view) appContent.dataset.moniGlobalView = view
  else delete appContent.dataset.moniGlobalView
}

export default function LegacyGlassThemeController() {
  const pathname = usePathname()

  useEffect(() => {
    let frame = 0
    const schedule = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => applyView(pathname))
    }

    schedule()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('popstate', schedule)

    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('popstate', schedule)
      const appContent = document.querySelector<HTMLElement>('[data-moni-app-content]')
      if (appContent) delete appContent.dataset.moniGlobalView
    }
  }, [pathname])

  return null
}
