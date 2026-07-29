'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

const MENU_ATTR = 'data-purchase-management-menu'
const CATEGORY_ACTIVE = 'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-semibold transition bg-emerald-500/15 text-emerald-200'
const CATEGORY_INACTIVE = 'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-semibold transition text-slate-200 hover:bg-slate-800/80 hover:text-white'
const ICON_ACTIVE = 'flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20'
const ICON_INACTIVE = 'flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800'
const ITEM_ACTIVE = 'mb-1 block w-full rounded-lg px-3 py-2 text-left text-sm transition bg-blue-600 text-white'
const ITEM_INACTIVE = 'mb-1 block w-full rounded-lg px-3 py-2 text-left text-sm transition text-slate-400 hover:bg-slate-800 hover:text-slate-100'
const items = [
  { label: '매입처 관리', view: 'suppliers' },
  { label: '매입·입고 관리', view: 'purchases' },
  { label: '지급·미지급금', view: 'payables' },
]

function normalizedText(element: Element | null) {
  return (element?.textContent || '').replace(/\s+/g, ' ').trim()
}

function currentView() {
  if (window.location.pathname !== '/business-management') return null
  const params = new URLSearchParams(window.location.search)
  if (params.get('tab') !== 'purchase') return null
  const view = params.get('view')
  return view === 'purchases' || view === 'payables' ? view : 'suppliers'
}

function setClassName(element: HTMLElement | null, className: string) {
  if (element && element.className !== className) element.className = className
}

export default function PurchaseManagementMenuController() {
  const router = useRouter()

  useEffect(() => {
    let frame: number | null = null
    let disposed = false

    const apply = () => {
      if (disposed) return
      const sidebar = document.querySelector<HTMLElement>('[data-moni-global-sidebar]')
      const nav = sidebar?.querySelector<HTMLElement>('nav')
      if (!sidebar || !nav) return

      const salesButton = Array.from(nav.querySelectorAll<HTMLButtonElement>(':scope > div > button[data-moni-global-nav]'))
        .find((button) => normalizedText(button.querySelector('span.flex-1')) === '판매관리')
      const salesRoot = salesButton?.parentElement
      if (!salesRoot) return

      let root = nav.querySelector<HTMLElement>(`[${MENU_ATTR}]`)
      if (!root) {
        root = document.createElement('div')
        root.setAttribute(MENU_ATTR, 'true')
        root.className = 'mb-1'

        const categoryButton = document.createElement('button')
        categoryButton.type = 'button'
        categoryButton.setAttribute('data-moni-global-nav', 'true')
        categoryButton.setAttribute('aria-expanded', 'false')
        categoryButton.className = CATEGORY_INACTIVE
        categoryButton.innerHTML = '<span class="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800" aria-hidden="true">₩</span><span class="flex-1">매입관리</span><span class="text-xs transition-transform duration-300">⌄</span>'

        const submenuGrid = document.createElement('div')
        submenuGrid.className = 'grid transition-all duration-300 ease-out grid-rows-[0fr] opacity-0'
        const clip = document.createElement('div')
        clip.className = 'overflow-hidden'
        const submenu = document.createElement('div')
        submenu.className = 'ml-7 mt-1 border-l border-slate-700/80 pl-3'

        for (const item of items) {
          const button = document.createElement('button')
          button.type = 'button'
          button.setAttribute('data-moni-global-nav', 'true')
          button.dataset.purchaseView = item.view
          button.className = ITEM_INACTIVE
          button.textContent = item.label
          button.addEventListener('click', (event) => {
            event.preventDefault()
            event.stopPropagation()
            router.push(`/business-management?tab=purchase&view=${item.view}`)
          })
          submenu.appendChild(button)
        }
        clip.appendChild(submenu)
        submenuGrid.appendChild(clip)
        root.append(categoryButton, submenuGrid)
      }

      if (root.nextElementSibling !== salesRoot) nav.insertBefore(root, salesRoot)

      const activeView = currentView()
      const categoryButton = root.querySelector<HTMLButtonElement>(':scope > button')
      const icon = categoryButton?.firstElementChild
      const itemButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-purchase-view]'))

      if (activeView) {
        for (const row of Array.from(nav.children)) {
          if (!(row instanceof HTMLElement) || row === root) continue
          const button = row.querySelector<HTMLButtonElement>(':scope > button[data-moni-global-nav]')
          if (!button) continue
          if (button.className.includes('bg-emerald-500/15')) setClassName(button, CATEGORY_INACTIVE)
          const rowIcon = button.firstElementChild
          if (rowIcon instanceof HTMLElement && rowIcon.className.includes('bg-emerald-500/20')) setClassName(rowIcon, ICON_INACTIVE)
          for (const item of Array.from(row.querySelectorAll<HTMLButtonElement>('div.grid button[data-moni-global-nav]'))) {
            if (item.className.includes('bg-blue-600')) setClassName(item, ITEM_INACTIVE)
          }
        }
      }

      setClassName(categoryButton, activeView ? CATEGORY_ACTIVE : CATEGORY_INACTIVE)
      if (icon instanceof HTMLElement) setClassName(icon, activeView ? ICON_ACTIVE : ICON_INACTIVE)
      for (const button of itemButtons) setClassName(button, button.dataset.purchaseView === activeView ? ITEM_ACTIVE : ITEM_INACTIVE)

      if (activeView) {
        const footer = Array.from(sidebar.querySelectorAll<HTMLElement>('span.block.truncate'))
          .find((element) => normalizedText(element).startsWith('현재 영역:'))
        if (footer && normalizedText(footer) !== '현재 영역: 매입관리') footer.innerHTML = '현재 영역: <b class="text-slate-300">매입관리</b>'
      }
    }

    const schedule = () => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(() => {
        frame = null
        apply()
      })
    }

    apply()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('popstate', schedule)

    return () => {
      disposed = true
      observer.disconnect()
      if (frame !== null) window.cancelAnimationFrame(frame)
      window.removeEventListener('popstate', schedule)
      document.querySelectorAll(`[${MENU_ATTR}]`).forEach((node) => node.remove())
    }
  }, [router])

  return null
}
