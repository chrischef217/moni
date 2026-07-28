'use client'

import { useEffect } from 'react'

const SIDEBAR_SELECTOR = '[data-moni-global-sidebar]'

function categoryRows(nav: HTMLElement) {
  return Array.from(nav.children).filter((element): element is HTMLElement => {
    if (!(element instanceof HTMLElement)) return false
    const button = element.querySelector<HTMLButtonElement>(':scope > button[data-moni-global-nav]')
    const submenu = element.querySelector<HTMLElement>(':scope > div.grid')
    return Boolean(button && submenu)
  })
}

function categoryButton(row: HTMLElement) {
  return row.querySelector<HTMLButtonElement>(':scope > button[data-moni-global-nav]')
}

function submenuGrid(row: HTMLElement) {
  return row.querySelector<HTMLElement>(':scope > div.grid')
}

function setExpanded(row: HTMLElement, expanded: boolean) {
  const button = categoryButton(row)
  const submenu = submenuGrid(row)
  if (!button || !submenu) return

  button.setAttribute('aria-expanded', String(expanded))
  submenu.classList.toggle('grid-rows-[1fr]', expanded)
  submenu.classList.toggle('opacity-100', expanded)
  submenu.classList.toggle('grid-rows-[0fr]', !expanded)
  submenu.classList.toggle('opacity-0', !expanded)

  const arrow = button.lastElementChild
  if (arrow instanceof HTMLElement) arrow.classList.toggle('rotate-180', expanded)
}

function isActiveRow(row: HTMLElement) {
  const button = categoryButton(row)
  if (button?.classList.contains('bg-emerald-500/15')) return true
  return Boolean(row.querySelector("button[class*='bg-blue-600']"))
}

function preferredActiveRow(rows: HTMLElement[]) {
  const params = new URLSearchParams(window.location.search)
  if (params.get('tab') === 'document-management') {
    const documentRow = rows.find((row) => row.hasAttribute('data-document-management-menu'))
    if (documentRow) return documentRow
  }
  return rows.find(isActiveRow) ?? null
}

function revealRow(nav: HTMLElement, row: HTMLElement, behavior: ScrollBehavior) {
  const navRect = nav.getBoundingClientRect()
  const rowRect = row.getBoundingClientRect()
  const padding = 12

  if (rowRect.bottom > navRect.bottom - padding) {
    nav.scrollTo({
      top: nav.scrollTop + rowRect.bottom - navRect.bottom + padding,
      behavior,
    })
    return
  }

  if (rowRect.top < navRect.top + padding) {
    nav.scrollTo({
      top: Math.max(0, nav.scrollTop - (navRect.top + padding - rowRect.top)),
      behavior,
    })
  }
}

export default function SidebarClickAccordionController() {
  useEffect(() => {
    let nav: HTMLElement | null = null
    let navObserver: MutationObserver | null = null
    let bodyObserver: MutationObserver | null = null
    let frame: number | null = null
    let openRow: HTMLElement | null = null
    let userHasToggled = false
    const revealTimers = new Set<number>()

    const clearRevealTimers = () => {
      for (const timer of revealTimers) window.clearTimeout(timer)
      revealTimers.clear()
    }

    const scheduleReveal = (row: HTMLElement, immediate = false) => {
      if (!nav) return
      clearRevealTimers()

      if (immediate) {
        const timer = window.setTimeout(() => {
          revealTimers.delete(timer)
          if (nav?.contains(row)) revealRow(nav, row, 'auto')
        }, 0)
        revealTimers.add(timer)
      }

      const finalTimer = window.setTimeout(() => {
        revealTimers.delete(finalTimer)
        if (nav?.contains(row)) revealRow(nav, row, 'smooth')
      }, 320)
      revealTimers.add(finalTimer)
    }

    const syncRows = () => {
      frame = null
      if (!nav) return
      const rows = categoryRows(nav)

      if (openRow && !nav.contains(openRow)) {
        openRow = null
        userHasToggled = false
      }
      if (!userHasToggled) openRow = preferredActiveRow(rows)

      for (const row of rows) setExpanded(row, row === openRow)
    }

    const scheduleSync = () => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(syncRows)
    }

    const handleCategoryClick = (event: MouseEvent) => {
      if (!nav) return
      const target = event.target
      if (!(target instanceof Element)) return
      const button = target.closest<HTMLButtonElement>('button[data-moni-global-nav]')
      if (!button) return
      const row = button.parentElement
      if (!(row instanceof HTMLElement) || row.parentElement !== nav || !submenuGrid(row)) return

      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()

      const shouldClose = openRow === row && button.getAttribute('aria-expanded') === 'true'
      userHasToggled = true
      openRow = shouldClose ? null : row

      for (const category of categoryRows(nav)) setExpanded(category, category === openRow)

      if (openRow) scheduleReveal(openRow, true)
      else clearRevealTimers()
    }

    const detachNav = () => {
      navObserver?.disconnect()
      navObserver = null
      clearRevealTimers()
      if (nav) nav.removeEventListener('click', handleCategoryClick, true)
      nav = null
      openRow = null
      userHasToggled = false
    }

    const attachCurrentNav = () => {
      const sidebar = document.querySelector<HTMLElement>(SIDEBAR_SELECTOR)
      const nextNav = sidebar?.querySelector<HTMLElement>('nav') ?? null
      if (nextNav === nav) return

      detachNav()
      if (!nextNav) return
      nav = nextNav
      nav.addEventListener('click', handleCategoryClick, true)

      navObserver = new MutationObserver((mutations) => {
        const needsSync = mutations.some((mutation) => {
          if (mutation.type === 'childList') return true
          if (mutation.type !== 'attributes' || mutation.attributeName !== 'class') return false
          const target = mutation.target
          if (!(target instanceof HTMLElement)) return false
          return target.matches(':scope > button[data-moni-global-nav]')
            || (target.matches('button[data-moni-global-nav]') && target.parentElement?.parentElement === nav)
        })
        if (needsSync) scheduleSync()
      })
      navObserver.observe(nav, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
      })

      syncRows()
      if (openRow) scheduleReveal(openRow)
    }

    const handleRouteChange = () => {
      userHasToggled = false
      scheduleSync()
    }

    attachCurrentNav()
    bodyObserver = new MutationObserver(() => {
      attachCurrentNav()
      scheduleSync()
    })
    bodyObserver.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('popstate', handleRouteChange)

    return () => {
      bodyObserver?.disconnect()
      detachNav()
      if (frame !== null) window.cancelAnimationFrame(frame)
      window.removeEventListener('popstate', handleRouteChange)
    }
  }, [])

  return (
    <style jsx global>{`
      [data-moni-global-sidebar] nav > div > button[data-moni-global-nav][aria-expanded='false'] + div.grid {
        grid-template-rows: 0fr !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }

      [data-moni-global-sidebar] nav > div > button[data-moni-global-nav][aria-expanded='true'] + div.grid {
        grid-template-rows: 1fr !important;
        opacity: 1 !important;
        pointer-events: auto !important;
      }

      [data-moni-global-sidebar] nav > div > button[data-moni-global-nav][aria-expanded='false'] > span:last-child {
        transform: rotate(0deg) !important;
      }

      [data-moni-global-sidebar] nav > div > button[data-moni-global-nav][aria-expanded='true'] > span:last-child {
        transform: rotate(180deg) !important;
      }

      [data-moni-global-sidebar] nav > div > button[data-moni-global-nav] {
        transform: none !important;
        translate: none !important;
      }

      [data-moni-global-sidebar] nav > div > button[data-moni-global-nav]:hover {
        transform: none !important;
        translate: none !important;
      }
    `}</style>
  )
}
