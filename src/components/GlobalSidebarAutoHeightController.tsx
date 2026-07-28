'use client'

import { useEffect } from 'react'

const SIDEBAR_SELECTOR = '[data-moni-global-sidebar]'
const PIN_SELECTOR = `${SIDEBAR_SELECTOR} button[aria-pressed][aria-label*="사이드바 고정"]`

function isDesktop() {
  return window.matchMedia('(min-width: 1024px)').matches
}

function sidebarIsPinned(sidebar: HTMLElement) {
  const toggle = sidebar.querySelector<HTMLButtonElement>(PIN_SELECTOR)
  return toggle?.getAttribute('aria-pressed') === 'true'
}

function sidebarIsVisible(sidebar: HTMLElement) {
  const rect = sidebar.getBoundingClientRect()
  return rect.right > 1 && rect.left < window.innerWidth
}

export default function GlobalSidebarAutoHeightController() {
  useEffect(() => {
    const originalBodyMinHeight = document.body.style.minHeight
    const originalHtmlMinHeight = document.documentElement.style.minHeight

    let sidebar: HTMLElement | null = null
    let nav: HTMLElement | null = null
    let footer: HTMLElement | null = null
    let resizeObserver: ResizeObserver | null = null
    let mutationObserver: MutationObserver | null = null
    let frame: number | null = null
    let lastVisible = false
    let lastPinned = true
    let peekAnchorScrollY = 0

    const restoreSidebarStyles = () => {
      if (!sidebar) return
      sidebar.style.removeProperty('bottom')
      sidebar.style.removeProperty('height')
      sidebar.style.removeProperty('min-height')
      sidebar.style.removeProperty('max-height')
      sidebar.style.removeProperty('overflow')
      sidebar.style.removeProperty('top')
      sidebar.style.removeProperty('overscroll-behavior')
      sidebar.removeAttribute('data-moni-sidebar-auto-height')
      sidebar.removeAttribute('data-moni-sidebar-content-height')
      sidebar.removeAttribute('data-moni-sidebar-page-offset')

      if (nav) {
        nav.style.removeProperty('flex')
        nav.style.removeProperty('overflow')
        nav.style.removeProperty('overflow-y')
        nav.style.removeProperty('max-height')
        nav.style.removeProperty('height')
        nav.style.removeProperty('scrollbar-width')
        nav.style.removeProperty('overscroll-behavior')
      }

      if (footer) footer.style.removeProperty('margin-top')
    }

    const releaseDocumentHeight = () => {
      document.body.style.minHeight = originalBodyMinHeight
      document.documentElement.style.minHeight = originalHtmlMinHeight
      delete document.body.dataset.moniSidebarDocumentHeight
    }

    const bindSidebar = (nextSidebar: HTMLElement | null) => {
      if (sidebar === nextSidebar) return

      resizeObserver?.disconnect()
      restoreSidebarStyles()
      sidebar = nextSidebar
      nav = sidebar?.querySelector<HTMLElement>('nav') ?? null
      footer = sidebar?.lastElementChild instanceof HTMLElement ? sidebar.lastElementChild : null
      lastVisible = false
      lastPinned = sidebar ? sidebarIsPinned(sidebar) : true
      peekAnchorScrollY = window.scrollY

      if (!sidebar) {
        releaseDocumentHeight()
        return
      }

      sidebar.setAttribute('data-moni-sidebar-auto-height', 'true')
      sidebar.style.setProperty('bottom', 'auto', 'important')
      sidebar.style.setProperty('height', 'auto', 'important')
      sidebar.style.setProperty('min-height', '100dvh', 'important')
      sidebar.style.setProperty('max-height', 'none', 'important')
      sidebar.style.setProperty('overflow', 'visible', 'important')
      sidebar.style.setProperty('overscroll-behavior', 'auto', 'important')

      if (nav) {
        nav.style.setProperty('flex', '0 0 auto', 'important')
        nav.style.setProperty('height', 'auto', 'important')
        nav.style.setProperty('max-height', 'none', 'important')
        nav.style.setProperty('overflow', 'visible', 'important')
        nav.style.setProperty('overflow-y', 'visible', 'important')
        nav.style.setProperty('scrollbar-width', 'none', 'important')
        nav.style.setProperty('overscroll-behavior', 'auto', 'important')
      }

      if (footer) footer.style.setProperty('margin-top', 'auto', 'important')

      resizeObserver = new ResizeObserver(schedule)
      resizeObserver.observe(sidebar)
      if (nav) resizeObserver.observe(nav)
      if (footer) resizeObserver.observe(footer)
    }

    const applyLayout = () => {
      bindSidebar(document.querySelector<HTMLElement>(SIDEBAR_SELECTOR))
      if (!sidebar) return

      const pinned = sidebarIsPinned(sidebar)
      const visible = sidebarIsVisible(sidebar)

      if (!pinned && visible && (!lastVisible || lastPinned)) {
        peekAnchorScrollY = window.scrollY
      }
      if (pinned && !lastPinned) peekAnchorScrollY = 0

      lastVisible = visible
      lastPinned = pinned

      if (!isDesktop()) {
        sidebar.style.setProperty('top', '0px', 'important')
        releaseDocumentHeight()
        return
      }

      const viewportHeight = Math.max(1, window.innerHeight)
      const contentHeight = Math.max(viewportHeight, Math.ceil(sidebar.scrollHeight))
      const overflowHeight = Math.max(0, contentHeight - viewportHeight)
      const scrollOrigin = pinned ? 0 : peekAnchorScrollY
      const pageProgress = Math.max(0, window.scrollY - scrollOrigin)
      const pageOffset = Math.min(pageProgress, overflowHeight)

      sidebar.style.setProperty('top', `${-pageOffset}px`, 'important')
      sidebar.setAttribute('data-moni-sidebar-content-height', String(contentHeight))
      sidebar.setAttribute('data-moni-sidebar-page-offset', String(pageOffset))

      if (overflowHeight > 0) {
        const requiredDocumentHeight = Math.ceil(scrollOrigin + contentHeight)
        const nextMinHeight = `${Math.max(viewportHeight, requiredDocumentHeight)}px`
        document.body.style.setProperty('min-height', nextMinHeight, 'important')
        document.documentElement.style.setProperty('min-height', nextMinHeight, 'important')
        document.body.dataset.moniSidebarDocumentHeight = String(requiredDocumentHeight)
      } else {
        releaseDocumentHeight()
      }
    }

    function schedule() {
      if (frame !== null) return
      frame = window.requestAnimationFrame(() => {
        frame = null
        applyLayout()
      })
    }

    bindSidebar(document.querySelector<HTMLElement>(SIDEBAR_SELECTOR))
    schedule()

    mutationObserver = new MutationObserver(schedule)
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'aria-pressed', 'style'],
    })

    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, { passive: true })
    document.addEventListener('pointerenter', schedule, true)
    document.addEventListener('pointerleave', schedule, true)
    document.addEventListener('focusin', schedule, true)
    document.addEventListener('focusout', schedule, true)

    return () => {
      mutationObserver?.disconnect()
      resizeObserver?.disconnect()
      if (frame !== null) window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule)
      document.removeEventListener('pointerenter', schedule, true)
      document.removeEventListener('pointerleave', schedule, true)
      document.removeEventListener('focusin', schedule, true)
      document.removeEventListener('focusout', schedule, true)
      restoreSidebarStyles()
      releaseDocumentHeight()
    }
  }, [])

  return (
    <style jsx global>{`
      [data-moni-global-sidebar][data-moni-sidebar-auto-height='true'] nav {
        scrollbar-width: none !important;
      }

      [data-moni-global-sidebar][data-moni-sidebar-auto-height='true'] nav::-webkit-scrollbar {
        display: none !important;
        width: 0 !important;
        height: 0 !important;
      }
    `}</style>
  )
}
