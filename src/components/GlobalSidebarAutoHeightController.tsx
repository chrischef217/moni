'use client'

import { useEffect } from 'react'

const SIDEBAR_SELECTOR = '[data-moni-global-sidebar]'
const SHELL_SELECTOR = '[data-moni-app-shell]'
const STAGE_SELECTOR = '[data-moni-weather-stage]'
const CONTENT_SELECTOR = '[data-moni-app-content]'

function clearLegacyExpansionStyles() {
  const shell = document.querySelector<HTMLElement>(SHELL_SELECTOR)
  const stage = document.querySelector<HTMLElement>(STAGE_SELECTOR)
  const content = document.querySelector<HTMLElement>(CONTENT_SELECTOR)

  if (shell) {
    shell.style.removeProperty('height')
    shell.style.removeProperty('min-height')
    shell.style.removeProperty('max-height')
    shell.style.removeProperty('overflow')
    shell.removeAttribute('data-moni-sidebar-expanded-height')
  }

  if (content) {
    content.style.removeProperty('height')
    content.style.removeProperty('min-height')
  }

  if (stage) {
    stage.style.removeProperty('overflow-x')
    stage.style.removeProperty('overflow-y')
    stage.style.removeProperty('place-items')
    stage.style.removeProperty('padding')
    stage.style.removeProperty('overscroll-behavior')
  }
}

function applyStableSidebarLayout(sidebar: HTMLElement) {
  const nav = sidebar.querySelector<HTMLElement>('nav')
  const footer = sidebar.lastElementChild instanceof HTMLElement ? sidebar.lastElementChild : null
  if (!nav || !footer) return

  sidebar.setAttribute('data-moni-sidebar-stable-scroll', 'true')
  sidebar.removeAttribute('data-moni-sidebar-auto-height')
  sidebar.removeAttribute('data-moni-sidebar-content-height')
  sidebar.style.removeProperty('bottom')
  sidebar.style.removeProperty('min-height')
  sidebar.style.removeProperty('max-height')
  sidebar.style.setProperty('height', '100%', 'important')
  sidebar.style.setProperty('overflow', 'hidden', 'important')

  nav.style.setProperty('flex', '1 1 auto', 'important')
  nav.style.setProperty('min-height', '0', 'important')
  nav.style.removeProperty('height')
  nav.style.removeProperty('max-height')
  nav.style.setProperty('overflow-x', 'hidden', 'important')
  nav.style.setProperty('overflow-y', 'auto', 'important')
  nav.style.setProperty('scrollbar-width', 'none', 'important')
  nav.style.setProperty('overscroll-behavior', 'contain', 'important')
  nav.style.setProperty('scroll-behavior', 'smooth', 'important')

  footer.style.setProperty('flex-shrink', '0', 'important')
  footer.style.setProperty('margin-top', '0', 'important')

  clearLegacyExpansionStyles()
}

export default function GlobalSidebarAutoHeightController() {
  useEffect(() => {
    let sidebar: HTMLElement | null = null
    let observer: MutationObserver | null = null
    let frame: number | null = null

    const apply = () => {
      frame = null
      const nextSidebar = document.querySelector<HTMLElement>(SIDEBAR_SELECTOR)
      if (!nextSidebar) return
      sidebar = nextSidebar
      applyStableSidebarLayout(nextSidebar)
    }

    const schedule = () => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(apply)
    }

    schedule()
    observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', schedule, { passive: true })

    return () => {
      observer?.disconnect()
      if (frame !== null) window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedule)
      sidebar?.removeAttribute('data-moni-sidebar-stable-scroll')
    }
  }, [])

  return (
    <style jsx global>{`
      [data-moni-global-sidebar][data-moni-sidebar-stable-scroll='true'] nav {
        min-height: 0 !important;
        overflow-x: hidden !important;
        overflow-y: auto !important;
        scrollbar-width: none !important;
        overscroll-behavior: contain !important;
      }

      [data-moni-global-sidebar][data-moni-sidebar-stable-scroll='true'] nav::-webkit-scrollbar {
        display: none !important;
        width: 0 !important;
        height: 0 !important;
      }

      @media (min-width: 1024px) and (max-height: 900px) {
        [data-moni-global-sidebar][data-moni-sidebar-stable-scroll='true'] nav {
          padding-top: 10px !important;
          padding-bottom: 10px !important;
        }

        [data-moni-global-sidebar][data-moni-sidebar-stable-scroll='true'] nav > div {
          margin-bottom: 3px !important;
        }

        [data-moni-global-sidebar][data-moni-sidebar-stable-scroll='true'] nav > div > button[data-moni-global-nav] {
          padding-top: 9px !important;
          padding-bottom: 9px !important;
        }
      }

      @media (min-width: 1024px) and (max-height: 760px) {
        [data-moni-global-sidebar][data-moni-sidebar-stable-scroll='true'] > div:first-child {
          padding-top: 10px !important;
          padding-bottom: 10px !important;
        }

        [data-moni-global-sidebar][data-moni-sidebar-stable-scroll='true'] nav {
          padding-top: 8px !important;
          padding-bottom: 8px !important;
        }

        [data-moni-global-sidebar][data-moni-sidebar-stable-scroll='true'] nav > div > button[data-moni-global-nav] {
          padding-top: 7px !important;
          padding-bottom: 7px !important;
        }

        [data-moni-global-sidebar][data-moni-sidebar-stable-scroll='true'] nav > div > button[data-moni-global-nav] > span:first-child {
          width: 30px !important;
          height: 30px !important;
        }

        [data-moni-global-sidebar][data-moni-sidebar-stable-scroll='true'] > div:last-child {
          padding-top: 8px !important;
          padding-bottom: 8px !important;
        }
      }

      @media (min-width: 1024px) and (max-height: 680px) {
        [data-moni-global-sidebar][data-moni-sidebar-stable-scroll='true'] nav > div > button[data-moni-global-nav] {
          padding-top: 6px !important;
          padding-bottom: 6px !important;
        }

        [data-moni-global-sidebar][data-moni-sidebar-stable-scroll='true'] nav button[data-moni-global-nav] {
          line-height: 1.2 !important;
        }
      }
    `}</style>
  )
}
