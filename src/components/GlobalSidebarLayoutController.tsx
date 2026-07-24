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

    const scheduleApply = () => {
      window.cancelAnimationFrame(animationFrame)
      animationFrame = window.requestAnimationFrame(applySidebarLayout)
    }

    applySidebarLayout()

    const observer = new MutationObserver(scheduleApply)
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'aria-pressed'],
    })

    window.addEventListener('resize', scheduleApply)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      observer.disconnect()
      window.removeEventListener('resize', scheduleApply)
      const appContent = document.querySelector<HTMLElement>('[data-moni-app-content]')
      appContent?.classList.remove('moni-global-sidebar-active', 'moni-sidebar-offset-active')
      appContent?.style.removeProperty('--moni-sidebar-width')
    }
  }, [])

  return null
}
