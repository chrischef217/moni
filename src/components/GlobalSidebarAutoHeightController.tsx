'use client'

import { useEffect } from 'react'

const SIDEBAR_SELECTOR = '[data-moni-global-sidebar]'
const SHELL_SELECTOR = '[data-moni-app-shell]'
const STAGE_SELECTOR = '[data-moni-weather-stage]'
const CONTENT_SELECTOR = '[data-moni-app-content]'

function defaultShellHeight() {
  if (window.innerWidth < 1024) return window.innerHeight
  return Math.max(620, Math.min(window.innerHeight * 0.9, 1100))
}

export default function GlobalSidebarAutoHeightController() {
  useEffect(() => {
    let sidebar: HTMLElement | null = null
    let shell: HTMLElement | null = null
    let stage: HTMLElement | null = null
    let content: HTMLElement | null = null
    let nav: HTMLElement | null = null
    let footer: HTMLElement | null = null
    let resizeObserver: ResizeObserver | null = null
    let mutationObserver: MutationObserver | null = null
    let frame: number | null = null

    const original = {
      sidebarBottom: '',
      sidebarHeight: '',
      sidebarMinHeight: '',
      sidebarMaxHeight: '',
      sidebarOverflow: '',
      navFlex: '',
      navHeight: '',
      navMaxHeight: '',
      navOverflow: '',
      navOverflowY: '',
      navScrollbarWidth: '',
      footerMarginTop: '',
      shellHeight: '',
      shellMinHeight: '',
      shellMaxHeight: '',
      shellOverflow: '',
      contentHeight: '',
      contentMinHeight: '',
      stageOverflowX: '',
      stageOverflowY: '',
      stagePlaceItems: '',
      stagePadding: '',
    }

    const saveOriginalStyles = () => {
      if (!sidebar || !shell || !stage || !content || !nav || !footer) return
      original.sidebarBottom = sidebar.style.bottom
      original.sidebarHeight = sidebar.style.height
      original.sidebarMinHeight = sidebar.style.minHeight
      original.sidebarMaxHeight = sidebar.style.maxHeight
      original.sidebarOverflow = sidebar.style.overflow
      original.navFlex = nav.style.flex
      original.navHeight = nav.style.height
      original.navMaxHeight = nav.style.maxHeight
      original.navOverflow = nav.style.overflow
      original.navOverflowY = nav.style.overflowY
      original.navScrollbarWidth = nav.style.scrollbarWidth
      original.footerMarginTop = footer.style.marginTop
      original.shellHeight = shell.style.height
      original.shellMinHeight = shell.style.minHeight
      original.shellMaxHeight = shell.style.maxHeight
      original.shellOverflow = shell.style.overflow
      original.contentHeight = content.style.height
      original.contentMinHeight = content.style.minHeight
      original.stageOverflowX = stage.style.overflowX
      original.stageOverflowY = stage.style.overflowY
      original.stagePlaceItems = stage.style.placeItems
      original.stagePadding = stage.style.padding
    }

    const restore = () => {
      resizeObserver?.disconnect()
      if (sidebar) {
        sidebar.style.bottom = original.sidebarBottom
        sidebar.style.height = original.sidebarHeight
        sidebar.style.minHeight = original.sidebarMinHeight
        sidebar.style.maxHeight = original.sidebarMaxHeight
        sidebar.style.overflow = original.sidebarOverflow
        sidebar.removeAttribute('data-moni-sidebar-auto-height')
        sidebar.removeAttribute('data-moni-sidebar-content-height')
      }
      if (nav) {
        nav.style.flex = original.navFlex
        nav.style.height = original.navHeight
        nav.style.maxHeight = original.navMaxHeight
        nav.style.overflow = original.navOverflow
        nav.style.overflowY = original.navOverflowY
        nav.style.scrollbarWidth = original.navScrollbarWidth
      }
      if (footer) footer.style.marginTop = original.footerMarginTop
      if (shell) {
        shell.style.height = original.shellHeight
        shell.style.minHeight = original.shellMinHeight
        shell.style.maxHeight = original.shellMaxHeight
        shell.style.overflow = original.shellOverflow
        shell.removeAttribute('data-moni-sidebar-expanded-height')
      }
      if (content) {
        content.style.height = original.contentHeight
        content.style.minHeight = original.contentMinHeight
      }
      if (stage) {
        stage.style.overflowX = original.stageOverflowX
        stage.style.overflowY = original.stageOverflowY
        stage.style.placeItems = original.stagePlaceItems
        stage.style.padding = original.stagePadding
      }
    }

    const bind = () => {
      const nextSidebar = document.querySelector<HTMLElement>(SIDEBAR_SELECTOR)
      const nextShell = document.querySelector<HTMLElement>(SHELL_SELECTOR)
      const nextStage = document.querySelector<HTMLElement>(STAGE_SELECTOR)
      const nextContent = document.querySelector<HTMLElement>(CONTENT_SELECTOR)
      const nextNav = nextSidebar?.querySelector<HTMLElement>('nav') ?? null
      const nextFooter = nextSidebar?.lastElementChild instanceof HTMLElement ? nextSidebar.lastElementChild : null

      if (
        sidebar === nextSidebar
        && shell === nextShell
        && stage === nextStage
        && content === nextContent
        && nav === nextNav
        && footer === nextFooter
      ) return

      restore()
      sidebar = nextSidebar
      shell = nextShell
      stage = nextStage
      content = nextContent
      nav = nextNav
      footer = nextFooter

      if (!sidebar || !shell || !stage || !content || !nav || !footer) return
      saveOriginalStyles()

      sidebar.setAttribute('data-moni-sidebar-auto-height', 'true')
      sidebar.style.setProperty('bottom', 'auto', 'important')
      sidebar.style.setProperty('height', 'auto', 'important')
      sidebar.style.setProperty('max-height', 'none', 'important')
      sidebar.style.setProperty('overflow', 'visible', 'important')

      nav.style.setProperty('flex', '0 0 auto', 'important')
      nav.style.setProperty('height', 'auto', 'important')
      nav.style.setProperty('max-height', 'none', 'important')
      nav.style.setProperty('overflow', 'visible', 'important')
      nav.style.setProperty('overflow-y', 'visible', 'important')
      nav.style.setProperty('scrollbar-width', 'none', 'important')
      footer.style.setProperty('margin-top', 'auto', 'important')

      shell.style.setProperty('max-height', 'none', 'important')
      shell.style.setProperty('overflow', 'hidden', 'important')
      content.style.setProperty('min-height', '100%', 'important')

      resizeObserver = new ResizeObserver(schedule)
      resizeObserver.observe(sidebar)
      resizeObserver.observe(nav)
      resizeObserver.observe(footer)
    }

    const applyLayout = () => {
      bind()
      if (!sidebar || !shell || !stage || !content || !nav || !footer) return

      const baseHeight = Math.ceil(defaultShellHeight())

      sidebar.style.setProperty('min-height', `${baseHeight}px`, 'important')
      shell.style.setProperty('height', `${baseHeight}px`, 'important')
      shell.style.setProperty('min-height', `${baseHeight}px`, 'important')
      content.style.setProperty('height', `${baseHeight}px`, 'important')

      const naturalHeight = Math.max(
        baseHeight,
        Math.ceil(sidebar.scrollHeight),
        Math.ceil(sidebar.firstElementChild?.scrollHeight ?? 0)
          + Math.ceil(nav.scrollHeight)
          + Math.ceil(footer.scrollHeight),
      )
      const targetHeight = Math.ceil(naturalHeight)
      const viewportHeight = Math.max(1, window.innerHeight)
      const needsOuterScroll = targetHeight > viewportHeight - 24

      sidebar.style.setProperty('min-height', `${targetHeight}px`, 'important')
      shell.style.setProperty('height', `${targetHeight}px`, 'important')
      shell.style.setProperty('min-height', `${targetHeight}px`, 'important')
      content.style.setProperty('height', `${targetHeight}px`, 'important')
      content.style.setProperty('min-height', `${targetHeight}px`, 'important')

      sidebar.setAttribute('data-moni-sidebar-content-height', String(targetHeight))
      shell.setAttribute('data-moni-sidebar-expanded-height', String(targetHeight))

      if (needsOuterScroll) {
        stage.style.setProperty('overflow-x', 'hidden', 'important')
        stage.style.setProperty('overflow-y', 'auto', 'important')
        stage.style.setProperty('place-items', 'start center', 'important')
        stage.style.setProperty('padding', '20px 0', 'important')
      } else {
        stage.style.overflowX = original.stageOverflowX
        stage.style.overflowY = original.stageOverflowY
        stage.style.placeItems = original.stagePlaceItems
        stage.style.padding = original.stagePadding
      }
    }

    function schedule() {
      if (frame !== null) return
      frame = window.requestAnimationFrame(() => {
        frame = null
        applyLayout()
      })
    }

    bind()
    schedule()

    mutationObserver = new MutationObserver(schedule)
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'aria-expanded', 'aria-pressed'],
    })

    window.addEventListener('resize', schedule)
    document.addEventListener('pointerenter', schedule, true)
    document.addEventListener('pointerleave', schedule, true)
    document.addEventListener('focusin', schedule, true)
    document.addEventListener('focusout', schedule, true)

    return () => {
      mutationObserver?.disconnect()
      resizeObserver?.disconnect()
      if (frame !== null) window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedule)
      document.removeEventListener('pointerenter', schedule, true)
      document.removeEventListener('pointerleave', schedule, true)
      document.removeEventListener('focusin', schedule, true)
      document.removeEventListener('focusout', schedule, true)
      restore()
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
