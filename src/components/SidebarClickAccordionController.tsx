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

  submenu.classList.toggle('grid-rows-[1fr]', expanded)
  submenu.classList.toggle('opacity-100', expanded)
  submenu.classList.toggle('grid-rows-[0fr]', !expanded)
  submenu.classList.toggle('opacity-0', !expanded)
  button.setAttribute('aria-expanded', String(expanded))

  const arrow = button.lastElementChild
  if (arrow instanceof HTMLElement) arrow.classList.toggle('rotate-180', expanded)
}

function isActiveRow(row: HTMLElement) {
  const button = categoryButton(row)
  return Boolean(button?.classList.contains('bg-emerald-500/15'))
}

function preferredActiveRow(rows: HTMLElement[]) {
  const params = new URLSearchParams(window.location.search)
  if (params.get('tab') === 'document-management') {
    const documentRow = rows.find((row) => row.hasAttribute('data-document-management-menu'))
    if (documentRow) return documentRow
  }
  return rows.find(isActiveRow) ?? null
}

export default function SidebarClickAccordionController() {
  useEffect(() => {
    let nav: HTMLElement | null = null
    let navObserver: MutationObserver | null = null
    let bodyObserver: MutationObserver | null = null
    let frame: number | null = null
    let openRow: HTMLElement | null = null
    let userHasToggled = false

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
    }

    const blockCategoryRollover = (event: Event) => {
      if (!nav) return
      const target = event.target
      if (!(target instanceof Element)) return
      const row = target.closest<HTMLElement>('nav > div')
      if (!row || row.parentElement !== nav || !submenuGrid(row)) return

      // 기존 React onMouseEnter가 카테고리를 자동으로 여는 것을 차단한다.
      event.stopPropagation()
      event.stopImmediatePropagation()
    }

    const detachNav = () => {
      navObserver?.disconnect()
      navObserver = null
      if (nav) {
        nav.removeEventListener('click', handleCategoryClick, true)
        nav.removeEventListener('mouseover', blockCategoryRollover, true)
        nav.removeEventListener('pointerover', blockCategoryRollover, true)
      }
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
      nav.addEventListener('mouseover', blockCategoryRollover, true)
      nav.addEventListener('pointerover', blockCategoryRollover, true)

      navObserver = new MutationObserver(scheduleSync)
      navObserver.observe(nav, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
      })
      syncRows()
    }

    attachCurrentNav()
    bodyObserver = new MutationObserver(() => {
      attachCurrentNav()
      scheduleSync()
    })
    bodyObserver.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('popstate', scheduleSync)

    return () => {
      bodyObserver?.disconnect()
      detachNav()
      if (frame !== null) window.cancelAnimationFrame(frame)
      window.removeEventListener('popstate', scheduleSync)
    }
  }, [])

  return null
}
