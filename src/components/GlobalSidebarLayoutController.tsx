'use client'

import { useLayoutEffect } from 'react'

const SIDEBAR_WIDTH = 264

function applySidebarLayout() {
  const appContent = document.querySelector<HTMLElement>('[data-moni-app-content]')
  const sidebar = document.querySelector<HTMLElement>('[data-moni-global-sidebar]')
  const isDesktop = window.matchMedia('(min-width: 1024px)').matches
  const isOpen = Boolean(sidebar && sidebar.classList.contains('lg:translate-x-0'))

  if (!appContent) return
  appContent.style.setProperty('--moni-sidebar-width', `${SIDEBAR_WIDTH}px`)
  appContent.classList.toggle('moni-global-sidebar-active', Boolean(sidebar))
  appContent.classList.toggle('moni-sidebar-offset-active', Boolean(sidebar) && isDesktop && isOpen)
}

export default function GlobalSidebarLayoutController() {
  useLayoutEffect(() => {
    let animationFrame = 0
    let retryTimer: number | null = null
    let attempts = 0
    let sidebarObserver: MutationObserver | null = null
    let disposed = false

    const scheduleApply = () => {
      window.cancelAnimationFrame(animationFrame)
      animationFrame = window.requestAnimationFrame(applySidebarLayout)
    }

    const attachSidebarObserver = () => {
      if (disposed || sidebarObserver) return
      const sidebar = document.querySelector<HTMLElement>('[data-moni-global-sidebar]')
      if (!sidebar) {
        attempts += 1
        if (attempts < 30) retryTimer = window.setTimeout(attachSidebarObserver, 100)
        return
      }

      sidebarObserver = new MutationObserver(scheduleApply)
      sidebarObserver.observe(sidebar, { attributes: true, attributeFilter: ['class'] })
      scheduleApply()
    }

    applySidebarLayout()
    attachSidebarObserver()
    window.addEventListener('resize', scheduleApply)

    return () => {
      disposed = true
      window.cancelAnimationFrame(animationFrame)
      if (retryTimer !== null) window.clearTimeout(retryTimer)
      sidebarObserver?.disconnect()
      window.removeEventListener('resize', scheduleApply)
      const appContent = document.querySelector<HTMLElement>('[data-moni-app-content]')
      appContent?.classList.remove('moni-global-sidebar-active', 'moni-sidebar-offset-active')
      appContent?.style.removeProperty('--moni-sidebar-width')
    }
  }, [])

  return null
}
