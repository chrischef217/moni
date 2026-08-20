'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

const salesItems = [
  { label: '거래명세표', view: 'statements' },
  { label: '수금·미수금', view: 'receivables' },
  { label: '세금계산서', view: 'tax-invoices' },
  { label: '영업 수당 정산', view: 'settlements' },
  { label: '매출처 관리', view: 'clients' },
  { label: '제품 규격 단가', view: 'pricing' },
]

function normalized(element: Element | null) { return (element?.textContent || '').replace(/\s+/g, ' ').trim() }
function setClassName(element: HTMLElement | null, className: string) { if (element && element.className !== className) element.className = className }
function currentView() { if (typeof window === 'undefined') return ''; if (window.location.pathname !== '/business-management') return ''; const params = new URLSearchParams(window.location.search); if (params.get('tab') !== 'sales-management') return ''; const raw = params.get('view') || 'statements'; return raw === 'sales' ? 'statements' : raw }
function salesHref(view: string) { return `/business-management?tab=sales-management&view=${view}` }
function removeRetiredSalesEntry(nav: HTMLElement) { for (const entry of Array.from(nav.querySelectorAll<HTMLElement>('button, a'))) if (normalized(entry) === '판매 등록') entry.remove() }

export default function SalesManagementMenuController() {
  const pathname = usePathname(); const router = useRouter()
  useEffect(() => {
    let stopped = false
    const patchSalesMenu = (nav: HTMLElement, view: string) => {
      const wrapper = nav.querySelector<HTMLElement>('[data-sales-management-menu]'); if (!wrapper) return null
      const salesActive = pathname === '/business-management' && Boolean(view) && view !== 'statistics'
      const existingButtons = Array.from(wrapper.querySelectorAll<HTMLButtonElement>('button[data-sales-view]'))
      const buttonByView = new Map(existingButtons.map((button) => [button.dataset.salesView || '', button]))
      buttonByView.get('sales')?.remove(); buttonByView.get('statistics')?.remove()
      const host = salesItems.map((item) => buttonByView.get(item.view)?.parentElement).find((node): node is HTMLElement => Boolean(node))
      if (host) {
        let previousButton: HTMLButtonElement | null = null
        for (const item of salesItems) {
          const button = buttonByView.get(item.view); if (!button) continue
          if (button.textContent !== item.label) button.textContent = item.label
          setClassName(button, `mb-1 block w-full rounded-lg px-3 py-2 text-left text-sm transition ${salesActive && view === item.view ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'}`)
          const correctlyPlaced = previousButton ? previousButton.nextElementSibling === button : host.firstElementChild === button
          if (button.parentElement !== host || !correctlyPlaced) { if (previousButton) previousButton.insertAdjacentElement('afterend', button); else host.prepend(button) }
          previousButton = button
        }
      }
      return wrapper
    }
    const ensureStatisticsCategory = (nav: HTMLElement, salesWrapper: HTMLElement | null, view: string) => {
      if (!salesWrapper) return
      let wrapper = nav.querySelector<HTMLElement>('[data-sales-statistics-menu]'); const active = pathname === '/business-management' && view === 'statistics'
      if (!wrapper) {
        wrapper = document.createElement('div'); wrapper.dataset.salesStatisticsMenu = 'true'; wrapper.className = 'mb-1'
        const categoryButton = document.createElement('button'); categoryButton.type = 'button'; categoryButton.dataset.moniGlobalNav = 'true'; categoryButton.dataset.salesStatisticsCategory = 'true'; categoryButton.setAttribute('aria-expanded', 'false'); categoryButton.className = 'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-semibold transition text-slate-200 hover:bg-slate-800/80 hover:text-white'; categoryButton.innerHTML = '<span data-sales-statistics-icon class="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800">▥</span><span class="flex-1">통계</span><span data-sales-statistics-arrow class="text-xs transition-transform duration-300">⌄</span>'
        const submenu = document.createElement('div'); submenu.dataset.salesStatisticsSubmenu = 'true'; submenu.className = 'grid grid-rows-[0fr] opacity-0 transition-all duration-300 ease-out'; submenu.innerHTML = '<div class="overflow-hidden"><div class="ml-7 mt-1 border-l border-slate-700/80 pl-3"><button data-moni-global-nav data-sales-statistics-item type="button" class="mb-1 block w-full rounded-lg px-3 py-2 text-left text-sm transition text-slate-400 hover:bg-slate-800 hover:text-slate-100">판매통계</button></div></div>'
        submenu.querySelector<HTMLButtonElement>('[data-sales-statistics-item]')?.addEventListener('click', (event) => { event.stopPropagation(); router.push(salesHref('statistics')) })
        wrapper.append(categoryButton, submenu); salesWrapper.insertAdjacentElement('afterend', wrapper)
      }
      const categoryButton = wrapper.querySelector<HTMLButtonElement>('[data-sales-statistics-category]'); const icon = wrapper.querySelector<HTMLElement>('[data-sales-statistics-icon]'); const item = wrapper.querySelector<HTMLButtonElement>('[data-sales-statistics-item]')
      setClassName(categoryButton, `flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-semibold transition ${active ? 'bg-emerald-500/15 text-emerald-200' : 'text-slate-200 hover:bg-slate-800/80 hover:text-white'}`); setClassName(icon, `flex h-8 w-8 items-center justify-center rounded-lg ${active ? 'bg-emerald-500/20' : 'bg-slate-800'}`); setClassName(item, `mb-1 block w-full rounded-lg px-3 py-2 text-left text-sm transition ${active ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'}`)
    }
    const patchSettlementTitle = (view: string) => { if (view !== 'settlements') return; for (const heading of Array.from(document.querySelectorAll<HTMLElement>('h1, h2'))) { const label = normalized(heading); if (label === '영업 정산서' || label === '영업정산서') heading.textContent = '영업 수당 정산' } }
    const apply = () => { if (stopped) return; const nav = document.querySelector<HTMLElement>('[data-moni-global-sidebar] nav'); if (!nav) return; removeRetiredSalesEntry(nav); const view = currentView(); const salesWrapper = patchSalesMenu(nav, view); ensureStatisticsCategory(nav, salesWrapper, view); patchSettlementTitle(view) }
    const timers = [0, 80, 250, 700, 1500].map((delay) => window.setTimeout(apply, delay)); window.addEventListener('popstate', apply)
    return () => { stopped = true; timers.forEach((timer) => window.clearTimeout(timer)); window.removeEventListener('popstate', apply); document.querySelector('[data-sales-statistics-menu]')?.remove() }
  }, [pathname, router])
  return null
}
