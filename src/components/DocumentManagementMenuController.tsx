'use client'

import { useEffect } from 'react'

const MENU_ATTR = 'data-document-management-menu'
const DOCUMENT_TAB = 'document-management'
const CATEGORY_ACTIVE = 'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-semibold transition bg-emerald-500/15 text-emerald-200'
const CATEGORY_INACTIVE = 'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-semibold transition text-slate-200 hover:bg-slate-800/80 hover:text-white'
const ICON_ACTIVE = 'flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20'
const ICON_INACTIVE = 'flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800'
const ITEM_ACTIVE = 'mb-1 block w-full rounded-lg px-3 py-2 text-left text-sm transition bg-blue-600 text-white'
const ITEM_INACTIVE = 'mb-1 block w-full rounded-lg px-3 py-2 text-left text-sm transition text-slate-400 hover:bg-slate-800 hover:text-slate-100'

function normalizedText(element: Element | null) {
  return (element?.textContent || '').replace(/\s+/g, ' ').trim()
}

function setClassName(element: HTMLElement | null, className: string) {
  if (element && element.className !== className) element.className = className
}

function currentView() {
  const params = new URLSearchParams(window.location.search)
  if (window.location.pathname !== '/business-management' || params.get('tab') !== DOCUMENT_TAB) return null
  return params.get('view') === 'quotes' ? 'quotes' : 'official'
}

function navigate(view: 'official' | 'quotes') {
  const nextPath = `/business-management?tab=${DOCUMENT_TAB}&view=${view}`
  const currentPath = `${window.location.pathname}${window.location.search}`
  if (currentPath !== nextPath) window.history.pushState(window.history.state, '', nextPath)
  window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))
}

function createSubmenuButton(label: string, view: 'official' | 'quotes') {
  const button = document.createElement('button')
  button.type = 'button'
  button.setAttribute('data-moni-global-nav', 'true')
  button.dataset.documentView = view
  button.className = ITEM_INACTIVE
  button.textContent = label
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    navigate(view)
  })
  return button
}

function createDocumentMenu() {
  const root = document.createElement('div')
  root.setAttribute(MENU_ATTR, 'true')
  root.className = 'mb-1'

  const categoryButton = document.createElement('button')
  categoryButton.type = 'button'
  categoryButton.setAttribute('data-moni-global-nav', 'true')
  categoryButton.setAttribute('aria-expanded', 'false')
  categoryButton.className = CATEGORY_INACTIVE
  categoryButton.innerHTML = `
    <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800" aria-hidden="true">▧</span>
    <span class="flex-1">문서관리</span>
    <span class="text-xs transition-transform duration-300">⌄</span>
  `

  const submenuGrid = document.createElement('div')
  submenuGrid.className = 'grid transition-all duration-300 ease-out grid-rows-[0fr] opacity-0'

  const submenuClip = document.createElement('div')
  submenuClip.className = 'overflow-hidden'

  const submenu = document.createElement('div')
  submenu.className = 'ml-7 mt-1 border-l border-slate-700/80 pl-3'
  submenu.append(
    createSubmenuButton('대외 공문 관리', 'official'),
    createSubmenuButton('견적서 관리', 'quotes'),
  )
  submenuClip.appendChild(submenu)
  submenuGrid.appendChild(submenuClip)
  root.append(categoryButton, submenuGrid)

  return root
}

function clearOtherActiveCategories(nav: HTMLElement, documentRoot: HTMLElement) {
  for (const row of Array.from(nav.children)) {
    if (!(row instanceof HTMLElement) || row === documentRoot) continue
    const button = row.querySelector<HTMLButtonElement>(':scope > button[data-moni-global-nav]')
    if (!button) continue
    setClassName(button, CATEGORY_INACTIVE)
    const icon = button.firstElementChild
    if (icon instanceof HTMLElement) setClassName(icon, ICON_INACTIVE)

    for (const item of Array.from(row.querySelectorAll<HTMLButtonElement>('div.grid button[data-moni-global-nav]'))) {
      if (item.className.includes('bg-blue-600')) setClassName(item, ITEM_INACTIVE)
    }
  }
}

function applyDocumentMenu() {
  const sidebar = document.querySelector<HTMLElement>('[data-moni-global-sidebar]')
  const nav = sidebar?.querySelector<HTMLElement>('nav')
  if (!sidebar || !nav) return

  const hrButton = Array.from(nav.querySelectorAll<HTMLButtonElement>(':scope > div > button[data-moni-global-nav]'))
    .find((button) => normalizedText(button.querySelector('span.flex-1')) === '인사관리')
  const hrRoot = hrButton?.parentElement
  if (!hrRoot) return

  let documentRoot = nav.querySelector<HTMLElement>(`[${MENU_ATTR}]`)
  if (!documentRoot) documentRoot = createDocumentMenu()
  if (documentRoot.nextElementSibling !== hrRoot) nav.insertBefore(documentRoot, hrRoot)

  const activeView = currentView()
  const categoryButton = documentRoot.querySelector<HTMLButtonElement>(':scope > button')
  const categoryIcon = categoryButton?.firstElementChild
  const itemButtons = Array.from(documentRoot.querySelectorAll<HTMLButtonElement>('[data-document-view]'))

  if (activeView) clearOtherActiveCategories(nav, documentRoot)
  setClassName(categoryButton, activeView ? CATEGORY_ACTIVE : CATEGORY_INACTIVE)
  if (categoryIcon instanceof HTMLElement) setClassName(categoryIcon, activeView ? ICON_ACTIVE : ICON_INACTIVE)

  for (const button of itemButtons) {
    setClassName(button, button.dataset.documentView === activeView ? ITEM_ACTIVE : ITEM_INACTIVE)
  }

  if (activeView) {
    const footerLabel = Array.from(sidebar.querySelectorAll<HTMLElement>('span.block.truncate'))
      .find((element) => normalizedText(element).startsWith('현재 영역:'))
    if (footerLabel && normalizedText(footerLabel) !== '현재 영역: 문서관리') {
      footerLabel.innerHTML = '현재 영역: <b class="text-slate-300">문서관리</b>'
    }
  }
}

export default function DocumentManagementMenuController() {
  useEffect(() => {
    let frame: number | null = null
    let lastHref = window.location.href
    const navigationTimers = new Set<number>()

    const syncWorkspaceRoute = () => {
      const nextHref = window.location.href
      if (nextHref === lastHref) return
      lastHref = nextHref
      window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))
    }

    const schedule = () => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(() => {
        frame = null
        syncWorkspaceRoute()
        applyDocumentMenu()
      })
    }

    const handleSidebarNavigation = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (!target?.closest('[data-moni-global-sidebar] [data-moni-global-nav]')) return
      for (const delay of [0, 60, 180, 360]) {
        const timer = window.setTimeout(() => {
          navigationTimers.delete(timer)
          schedule()
        }, delay)
        navigationTimers.add(timer)
      }
    }

    applyDocumentMenu()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('popstate', schedule)
    document.addEventListener('click', handleSidebarNavigation, true)

    return () => {
      observer.disconnect()
      if (frame !== null) window.cancelAnimationFrame(frame)
      for (const timer of navigationTimers) window.clearTimeout(timer)
      navigationTimers.clear()
      window.removeEventListener('popstate', schedule)
      document.removeEventListener('click', handleSidebarNavigation, true)
      document.querySelectorAll(`[${MENU_ATTR}]`).forEach((node) => node.remove())
    }
  }, [])

  return (
    <style jsx global>{`
      [data-moni-app-content] [data-document-management-workspace] {
        inset: 0 !important;
        min-width: 0 !important;
        overflow-x: hidden !important;
        overflow-y: auto !important;
        overscroll-behavior: contain;
        scrollbar-gutter: stable;
        background:
          radial-gradient(circle at 86% 0%, rgba(134, 207, 255, 0.22), transparent 30%),
          linear-gradient(145deg, #f6fbff 0%, #e7f2fc 100%) !important;
        background-color: #eef7fd !important;
        isolation: isolate;
      }

      [data-document-management-workspace] > div,
      [data-document-management-workspace] header,
      [data-document-management-workspace] section {
        min-width: 0 !important;
        max-width: 100% !important;
      }

      [data-document-management-workspace] section > div.overflow-x-auto {
        max-width: 100% !important;
        overflow-x: hidden !important;
      }

      [data-document-management-workspace] table {
        width: 100% !important;
        min-width: 0 !important;
        table-layout: fixed !important;
      }

      [data-document-management-workspace] th,
      [data-document-management-workspace] td {
        min-width: 0 !important;
        overflow-wrap: anywhere;
        word-break: keep-all;
      }

      [data-document-management-workspace] th:nth-child(1),
      [data-document-management-workspace] td:nth-child(1) { width: 15%; }
      [data-document-management-workspace] th:nth-child(2),
      [data-document-management-workspace] td:nth-child(2) { width: 10%; }
      [data-document-management-workspace] th:nth-child(3),
      [data-document-management-workspace] td:nth-child(3) { width: 10%; }
      [data-document-management-workspace] th:nth-child(4),
      [data-document-management-workspace] td:nth-child(4) { width: 14%; }
      [data-document-management-workspace] th:nth-child(5),
      [data-document-management-workspace] td:nth-child(5) { width: 22%; }
      [data-document-management-workspace] th:nth-child(6),
      [data-document-management-workspace] td:nth-child(6) { width: 10%; }
      [data-document-management-workspace] th:nth-child(7),
      [data-document-management-workspace] td:nth-child(7) { width: 19%; }

      [data-document-management-workspace] td:nth-child(5) .truncate {
        display: block !important;
        overflow: visible !important;
        white-space: normal !important;
        text-overflow: clip !important;
      }

      [data-document-management-workspace] td:nth-child(7) > div {
        align-items: center;
        justify-content: center;
      }

      [data-document-management-workspace] ~ [data-global-moni-agent] {
        z-index: 900 !important;
      }

      @media (min-width: 1024px) {
        [data-moni-app-content].moni-sidebar-offset-active [data-document-management-workspace] {
          left: var(--moni-sidebar-width, 264px) !important;
        }
      }

      @media (max-width: 1399px) and (min-width: 1024px) {
        [data-document-management-workspace] th,
        [data-document-management-workspace] td {
          padding-left: 9px !important;
          padding-right: 9px !important;
          font-size: 12px;
        }

        [data-document-management-workspace] td:nth-child(7) button {
          padding-left: 8px !important;
          padding-right: 8px !important;
        }
      }
    `}</style>
  )
}
