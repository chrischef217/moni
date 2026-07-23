'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

function normalized(element: Element) {
  return (element.textContent || '').replace(/\s+/g, ' ').trim()
}

export default function IntelligenceMenuController() {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    let stopped = false

    const inject = () => {
      if (stopped) return
      const nav = document.querySelector<HTMLElement>('[data-moni-global-sidebar] nav')
      if (!nav) return
      const dashboardWrapper = Array.from(nav.children).find((element) => normalized(element).includes('통합 대시보드')) as HTMLElement | undefined
      if (!dashboardWrapper) return
      const host = dashboardWrapper.querySelector<HTMLElement>('.ml-7')
      if (!host) return

      let button = host.querySelector<HTMLButtonElement>('[data-intelligence-nav]')
      if (!button) {
        button = document.createElement('button')
        button.type = 'button'
        button.dataset.moniGlobalNav = 'true'
        button.dataset.intelligenceNav = 'true'
        button.textContent = 'MONI Intelligence'
        host.appendChild(button)
        button.addEventListener('click', (event) => {
          event.stopPropagation()
          router.push('/intelligence')
        })
      }
      const active = pathname === '/intelligence'
      button.className = `mb-1 block w-full rounded-lg px-3 py-2 text-left text-sm transition ${active ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'}`
      if (active) {
        for (const sibling of Array.from(host.querySelectorAll<HTMLButtonElement>('button:not([data-intelligence-nav])'))) {
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
      document.querySelector('[data-intelligence-nav]')?.remove()
    }
  }, [pathname, router])

  return null
}
