'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

const items = [
  { label: '거래처 관리', view: 'clients' },
  { label: '판매 등록', view: 'sales' },
  { label: '거래명세표', view: 'statements' },
  { label: '판매 통계', view: 'statistics' },
  { label: '세금계산서', view: 'tax-invoices' },
]

function normalized(element: Element) {
  return (element.textContent || '').replace(/\s+/g, ' ').trim()
}

function currentView() {
  return new URLSearchParams(window.location.search).get('view') || 'clients'
}

export default function SalesManagementMenuController() {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    let observer: MutationObserver | null = null
    let stopped = false

    const markActive = (view: string) => {
      const active = pathname === '/sales-management'
      const wrapper = document.querySelector<HTMLElement>('[data-sales-management-menu]')
      if (!wrapper) return
      for (const button of Array.from(wrapper.querySelectorAll<HTMLButtonElement>('button[data-sales-view]'))) {
        const selected = active && button.dataset.salesView === view
        button.className = `mb-1 block w-full rounded-lg px-3 py-2 text-left text-sm transition ${selected ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'}`
      }
    }

    const inject = () => {
      if (stopped) return
      const nav = document.querySelector<HTMLElement>('[data-moni-global-sidebar] nav')
      if (!nav) return

      const existing = nav.querySelector<HTMLElement>('[data-sales-management-menu]')
      if (existing) existing.remove()

      const wrappers = Array.from(nav.children) as HTMLElement[]
      const accountingWrapper = wrappers.find((wrapper) => normalized(wrapper).includes('회계·세무관리'))
      const salesWrapper = wrappers.find((wrapper) => normalized(wrapper).includes('영업관리'))
      const reference = accountingWrapper || salesWrapper?.nextElementSibling
      if (!reference) return

      const active = pathname === '/sales-management'
      const activeView = currentView()
      const wrapper = document.createElement('div')
      wrapper.dataset.salesManagementMenu = 'true'
      wrapper.className = 'mb-1'

      const categoryButton = document.createElement('button')
      categoryButton.type = 'button'
      categoryButton.dataset.moniGlobalNav = 'true'
      categoryButton.className = `flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-semibold transition ${active ? 'bg-emerald-500/15 text-emerald-200' : 'text-slate-200 hover:bg-slate-800/80 hover:text-white'}`
      categoryButton.innerHTML = `<span class="flex h-8 w-8 items-center justify-center rounded-lg ${active ? 'bg-emerald-500/20' : 'bg-slate-800'}">▤</span><span class="flex-1">판매관리</span><span data-sales-arrow class="text-xs transition-transform duration-300">⌄</span>`
      categoryButton.addEventListener('click', () => {
        markActive('clients')
        router.push('/sales-management?view=clients')
      })

      const submenu = document.createElement('div')
      submenu.className = 'grid grid-rows-[0fr] opacity-0 transition-all duration-300 ease-out'
      submenu.innerHTML = '<div class="overflow-hidden"><div data-sales-items class="ml-7 mt-1 border-l border-slate-700/80 pl-3"></div></div>'
      const itemHost = submenu.querySelector<HTMLElement>('[data-sales-items]')

      for (const item of items) {
        const button = document.createElement('button')
        button.type = 'button'
        button.dataset.moniGlobalNav = 'true'
        button.dataset.salesView = item.view
        button.className = `mb-1 block w-full rounded-lg px-3 py-2 text-left text-sm transition ${active && activeView === item.view ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'}`
        button.textContent = item.label
        button.addEventListener('click', (event) => {
          event.stopPropagation()
          markActive(item.view)
          router.push(`/sales-management?view=${item.view}`)
        })
        itemHost?.appendChild(button)
      }

      const setExpanded = (expanded: boolean) => {
        submenu.className = `grid transition-all duration-300 ease-out ${expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`
        const arrow = categoryButton.querySelector<HTMLElement>('[data-sales-arrow]')
        arrow?.classList.toggle('rotate-180', expanded)
      }
      wrapper.addEventListener('mouseenter', () => setExpanded(true))
      wrapper.addEventListener('mouseleave', () => setExpanded(false))
      wrapper.append(categoryButton, submenu)
      nav.insertBefore(wrapper, reference)

      if (!observer) {
        observer = new MutationObserver(() => {
          if (!nav.querySelector('[data-sales-management-menu]')) inject()
        })
        observer.observe(nav, { childList: true })
      }
    }

    const syncFromAddress = () => markActive(currentView())
    window.addEventListener('popstate', syncFromAddress)

    inject()
    let attempts = 0
    const timer = window.setInterval(() => {
      attempts += 1
      if (!document.querySelector('[data-sales-management-menu]')) inject()
      if (document.querySelector('[data-sales-management-menu]') || attempts >= 20) window.clearInterval(timer)
    }, 120)

    return () => {
      stopped = true
      window.clearInterval(timer)
      window.removeEventListener('popstate', syncFromAddress)
      observer?.disconnect()
      document.querySelector('[data-sales-management-menu]')?.remove()
    }
  }, [pathname, router])

  return null
}
