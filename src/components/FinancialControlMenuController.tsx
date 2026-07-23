'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

function normalized(element: Element) {
  return (element.textContent || '').replace(/\s+/g, ' ').trim()
}

export default function FinancialControlMenuController() {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    let stopped = false

    const isFinancialRoute = () => {
      const params = new URLSearchParams(window.location.search)
      return pathname === '/business-management' && params.get('tab') === 'accounting' && params.get('view') === 'financial-control'
    }

    const inject = () => {
      if (stopped) return
      const nav = document.querySelector<HTMLElement>('[data-moni-global-sidebar] nav')
      if (!nav) return
      const accountingWrapper = Array.from(nav.children).find((element) => normalized(element).includes('회계·세무관리')) as HTMLElement | undefined
      if (!accountingWrapper) return
      const host = accountingWrapper.querySelector<HTMLElement>('.ml-7')
      if (!host) return

      let button = host.querySelector<HTMLButtonElement>('[data-financial-control-nav]')
      if (!button) {
        button = document.createElement('button')
        button.type = 'button'
        button.dataset.moniGlobalNav = 'true'
        button.dataset.financialControlNav = 'true'
        button.textContent = '현금흐름·세무'
        host.insertBefore(button, host.firstChild)
        button.addEventListener('click', (event) => {
          event.stopPropagation()
          router.push('/business-management?tab=accounting&view=financial-control')
        })
      }

      const active = isFinancialRoute()
      button.className = `mb-1 block w-full rounded-lg px-3 py-2 text-left text-sm transition ${active ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'}`
      if (active) {
        for (const sibling of Array.from(host.querySelectorAll<HTMLButtonElement>('button:not([data-financial-control-nav])'))) {
          sibling.className = 'mb-1 block w-full rounded-lg px-3 py-2 text-left text-sm transition text-slate-400 hover:bg-slate-800 hover:text-slate-100'
        }
      }
    }

    inject()
    const observer = new MutationObserver(inject)
    observer.observe(document.body, { childList: true, subtree: true })
    const timer = window.setInterval(inject, 800)
    return () => {
      stopped = true
      observer.disconnect()
      window.clearInterval(timer)
      document.querySelector('[data-financial-control-nav]')?.remove()
    }
  }, [pathname, router])

  return null
}
