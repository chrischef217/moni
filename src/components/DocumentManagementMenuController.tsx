'use client'

import { useEffect } from 'react'

const MENU_ATTR = 'data-document-management-menu'
const DOCUMENT_TAB = 'document-management'

function normalizedText(element: Element | null) {
  return (element?.textContent || '').replace(/\s+/g, ' ').trim()
}

function currentView() {
  const params = new URLSearchParams(window.location.search)
  if (window.location.pathname !== '/business-management' || params.get('tab') !== DOCUMENT_TAB) return null
  return params.get('view') === 'quotes' ? 'quotes' : 'official'
}

function navigate(view: 'official' | 'quotes') {
  window.location.assign(`/business-management?tab=${DOCUMENT_TAB}&view=${view}`)
}

function createSubmenuButton(label: string, view: 'official' | 'quotes') {
  const button = document.createElement('button')
  button.type = 'button'
  button.setAttribute('data-moni-global-nav', 'true')
  button.dataset.documentView = view
  button.className = 'mb-1 block w-full rounded-lg px-3 py-2 text-left text-sm transition'
  button.textContent = label
  button.addEventListener('click', () => navigate(view))
  return button
}

function createDocumentMenu() {
  const root = document.createElement('div')
  root.setAttribute(MENU_ATTR, 'true')
  root.className = 'mb-1'

  const categoryButton = document.createElement('button')
  categoryButton.type = 'button'
  categoryButton.setAttribute('data-moni-global-nav', 'true')
  categoryButton.className = 'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-semibold transition'
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

  const setExpanded = (expanded: boolean) => {
    submenuGrid.className = `grid transition-all duration-300 ease-out ${expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`
    const arrow = categoryButton.lastElementChild
    if (arrow instanceof HTMLElement) arrow.classList.toggle('rotate-180', expanded)
  }

  root.addEventListener('mouseenter', () => {
    if (window.innerWidth >= 1024) setExpanded(true)
  })
  root.addEventListener('mouseleave', () => {
    if (window.innerWidth >= 1024) setExpanded(false)
  })
  categoryButton.addEventListener('click', () => {
    if (window.innerWidth < 1024) {
      setExpanded(!submenuGrid.className.includes('grid-rows-[1fr]'))
      return
    }
    navigate('official')
  })

  return root
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

  if (categoryButton) {
    categoryButton.className = `flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-semibold transition ${
      activeView ? 'bg-emerald-500/15 text-emerald-200' : 'text-slate-200 hover:bg-slate-800/80 hover:text-white'
    }`
  }
  if (categoryIcon instanceof HTMLElement) {
    categoryIcon.className = `flex h-8 w-8 items-center justify-center rounded-lg ${activeView ? 'bg-emerald-500/20' : 'bg-slate-800'}`
  }

  for (const button of itemButtons) {
    const active = button.dataset.documentView === activeView
    button.className = `mb-1 block w-full rounded-lg px-3 py-2 text-left text-sm transition ${
      active ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
    }`
  }

  if (activeView) {
    const footerLabel = Array.from(sidebar.querySelectorAll<HTMLElement>('span.block.truncate'))
      .find((element) => normalizedText(element).startsWith('현재 영역:'))
    if (footerLabel) footerLabel.innerHTML = '현재 영역: <b class="text-slate-300">문서관리</b>'
  }
}

export default function DocumentManagementMenuController() {
  useEffect(() => {
    let frame: number | null = null
    const schedule = () => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(() => {
        frame = null
        applyDocumentMenu()
      })
    }

    applyDocumentMenu()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('popstate', schedule)

    return () => {
      observer.disconnect()
      if (frame !== null) window.cancelAnimationFrame(frame)
      window.removeEventListener('popstate', schedule)
      document.querySelectorAll(`[${MENU_ATTR}]`).forEach((node) => node.remove())
    }
  }, [])

  return null
}
