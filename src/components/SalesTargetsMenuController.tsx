'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

function normalized(element: Element) {
  return (element.textContent || '').replace(/\s+/g, ' ').trim()
}

export default function SalesTargetsMenuController() {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    let stopped = false

    const isTargetRoute = () => {
      const params = new URLSearchParams(window.location.search)
      return pathname === '/business-management' && params.get('tab') === 'sales' && params.get('view') === 'targets'
    }

    const inject = () => {
      if (stopped) return
      const nav = document.querySelector<HTMLElement>('[data-moni-global-sidebar] nav')
      if (!nav) return
      const salesWrapper = Array.from(nav.children).find((element) => normalized(element).includes('영업관리')) as HTMLElement | undefined
      if (!salesWrapper) return
      const host = salesWrapper.querySelector<HTMLElement>('.ml-7')
      if (!host) return

      let button = host.querySelector<HTMLButtonElement>('[data-sales-targets-nav]')
      if (!button) {
        button = document.createElement('button')
        button.type = 'button'
        button.dataset.moniGlobalNav = 'true'
        button.dataset.salesTargetsNav = 'true'
        button.textContent = '영업 목표매출'
        const pipelineButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((item) => normalized(item) === '영업기회 파이프라인')
        host.insertBefore(button, pipelineButton || host.firstChild)
        button.addEventListener('click', (event) => {
          event.stopPropagation()
          router.push('/business-management?tab=sales&view=targets')
        })
      }

      const active = isTargetRoute()
      button.className = `mb-1 block w-full rounded-lg px-3 py-2 text-left text-sm transition ${active ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'}`
      if (active) {
        for (const sibling of Array.from(host.querySelectorAll<HTMLButtonElement>('button:not([data-sales-targets-nav])'))) {
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
      document.querySelector('[data-sales-targets-nav]')?.remove()
    }
  }, [pathname, router])

  return null
}
