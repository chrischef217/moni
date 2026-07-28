'use client'

import { useLayoutEffect } from 'react'

const SIDEBAR_WIDTH = 264
const PIN_STORAGE_KEY = 'moni-sidebar-pinned'
const PIN_TOGGLE_SELECTOR = '[data-moni-global-sidebar] button[aria-pressed]'

function readPinnedState() {
  const pinToggle = document.querySelector<HTMLButtonElement>(PIN_TOGGLE_SELECTOR)
  if (pinToggle) return pinToggle.getAttribute('aria-pressed') === 'true'
  return window.localStorage.getItem(PIN_STORAGE_KEY) !== 'false'
}

function applySidebarLayout(forcedPinned?: boolean) {
  const appContent = document.querySelector<HTMLElement>('[data-moni-app-content]')
  const sidebar = document.querySelector<HTMLElement>('[data-moni-global-sidebar]')
  const isDesktop = window.matchMedia('(min-width: 1024px)').matches
  const isPinned = typeof forcedPinned === 'boolean' ? forcedPinned : readPinnedState()

  if (!appContent) return
  appContent.style.setProperty('--moni-sidebar-width', `${SIDEBAR_WIDTH}px`)
  appContent.classList.toggle('moni-global-sidebar-active', Boolean(sidebar))
  appContent.classList.toggle('moni-sidebar-offset-active', Boolean(sidebar) && isDesktop && isPinned)
  appContent.dataset.moniSidebarPinned = isPinned ? 'true' : 'false'
}

export default function GlobalSidebarLayoutController() {
  useLayoutEffect(() => {
    let animationFrame = 0
    let observedToggle: HTMLButtonElement | null = null
    let pinObserver: MutationObserver | null = null
    let shellObserver: MutationObserver | null = null

    const scheduleApply = (forcedPinned?: boolean) => {
      window.cancelAnimationFrame(animationFrame)
      animationFrame = window.requestAnimationFrame(() => applySidebarLayout(forcedPinned))
    }

    const attachPinObserver = () => {
      const nextToggle = document.querySelector<HTMLButtonElement>(PIN_TOGGLE_SELECTOR)
      if (nextToggle === observedToggle) return

      pinObserver?.disconnect()
      observedToggle = nextToggle

      if (nextToggle) {
        pinObserver = new MutationObserver(() => scheduleApply())
        pinObserver.observe(nextToggle, { attributes: true, attributeFilter: ['aria-pressed'] })
      } else {
        pinObserver = null
      }

      scheduleApply()
    }

    const handlePinClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null
      const button = target?.closest<HTMLButtonElement>(PIN_TOGGLE_SELECTOR)
      if (!button) return

      // React updates aria-pressed after the click handler runs. Apply the known
      // next state immediately, then verify again after React commits the DOM.
      const nextPinned = button.getAttribute('aria-pressed') !== 'true'
      applySidebarLayout(nextPinned)
      window.setTimeout(() => scheduleApply(), 0)
      window.setTimeout(() => scheduleApply(), 80)
    }

    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key === PIN_STORAGE_KEY) scheduleApply()
    }

    applySidebarLayout()
    attachPinObserver()

    // The route boundary remounts the sidebar on navigation. Watch only for a
    // replacement toggle and reconnect the narrow aria-pressed observer.
    const shell = document.querySelector<HTMLElement>('[data-moni-app-shell]') || document.body
    shellObserver = new MutationObserver(attachPinObserver)
    shellObserver.observe(shell, { childList: true, subtree: true })

    const retryTimers = [50, 200, 600, 1200].map((delay) => window.setTimeout(attachPinObserver, delay))
    document.addEventListener('click', handlePinClick, true)
    window.addEventListener('resize', scheduleApply)
    window.addEventListener('storage', handleStorage)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      retryTimers.forEach((timer) => window.clearTimeout(timer))
      pinObserver?.disconnect()
      shellObserver?.disconnect()
      document.removeEventListener('click', handlePinClick, true)
      window.removeEventListener('resize', scheduleApply)
      window.removeEventListener('storage', handleStorage)
      const appContent = document.querySelector<HTMLElement>('[data-moni-app-content]')
      appContent?.classList.remove('moni-global-sidebar-active', 'moni-sidebar-offset-active')
      appContent?.style.removeProperty('--moni-sidebar-width')
      delete appContent?.dataset.moniSidebarPinned
    }
  }, [])

  return null
}
