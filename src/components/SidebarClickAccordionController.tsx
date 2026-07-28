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
  if (!button) return false
  return button.classList.contains('bg-emerald-500/15')
}

export default function SidebarClickAccordionController() {
  useEffect(() => {
    let sidebar: HTMLElement | null = null
    let nav: HTMLElement | null = null
    let observer: MutationObserver | null = null
    let waitObserver: MutationObserver | null = null
    let frame: number | null = null
    let openRow: HTMLElement | null = null

    const syncRows = () => {
      frame = null
      if (!nav) return
      const rows = categoryRows(nav)

      if (openRow && !nav.contains(openRow)) openRow = null
      if (!openRow) openRow = rows.find(isActiveRow) ?? null

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
      openRow = shouldClose ? null : row
      for (const category of categoryRows(nav)) setExpanded(category, category === openRow)
    }

    const blockCategoryRollover = (event: Event) => {
      if (!nav) return
      const target = event.target
      if (!(target instanceof Element)) return
      const row = target.closest<HTMLElement>(':scope > div')
      if (!row || row.parentElement !== nav || !submenuGrid(row)) return

      // React의 기존 onMouseEnter가 하위 메뉴를 여는 것을 차단한다.
      event.stopPropagation()
      if ('stopImmediatePropagation' in event) event.stopImmediatePropagation()
    }

    const attach = () => {
      sidebar = document.querySelector<HTMLElement>(SIDEBAR_SELECTOR)
      nav = sidebar?.querySelector<HTMLElement>('nav') ?? null
      if (!sidebar || !nav) return false

      nav.addEventListener('click', handleCategoryClick, true)
      nav.addEventListener('mouseover', blockCategoryRollover, true)
      nav.addEventListener('pointerover', blockCategoryRollover, true)

      observer = new MutationObserver(scheduleSync)
      observer.observe(nav, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
      })
      syncRows()
      return true
    }

    if (!attach()) {
      waitObserver = new MutationObserver(() => {
        if (!attach()) return
        waitObserver?.disconnect()
        waitObserver = null
      })
      waitObserver.observe(document.body, { childList: true, subtree: true })
    }

    return () => {
      observer?.disconnect()
      waitObserver?.disconnect()
      if (frame !== null) window.cancelAnimationFrame(frame)
      nav?.removeEventListener('click', handleCategoryClick, true)
      nav?.removeEventListener('mouseover', blockCategoryRollover, true)
      nav?.removeEventListener('pointerover', blockCategoryRollover, true)
    }
  }, [])

  return null
}
