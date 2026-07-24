'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

function normalized(element: Element | null) {
  return (element?.textContent || '').replace(/\s+/g, ' ').trim()
}

export default function AppearanceSettingsMenuController() {
  const pathname = usePathname()

  useEffect(() => {
    let sentinel: HTMLButtonElement | null = null

    if (pathname === '/settings/appearance') {
      sentinel = document.createElement('button')
      sentinel.type = 'button'
      sentinel.textContent = '로그아웃'
      sentinel.setAttribute('aria-hidden', 'true')
      sentinel.dataset.moniAppearanceSentinel = 'true'
      sentinel.style.display = 'none'
      document.body.appendChild(sentinel)
    }

    const inject = () => {
      const sidebar = document.querySelector<HTMLElement>('[data-moni-global-sidebar]')
      const nav = sidebar?.querySelector<HTMLElement>('nav')
      if (!sidebar || !nav) return

      const wrappers = Array.from(nav.children).filter((element): element is HTMLElement => element instanceof HTMLElement)
      const adminWrapper = wrappers.find((wrapper) => normalized(wrapper).includes('관리자'))
      if (!adminWrapper) return

      const submenu = adminWrapper.querySelector<HTMLElement>('.ml-7')
      if (!submenu) return

      let button = submenu.querySelector<HTMLButtonElement>('[data-moni-appearance-menu]')
      if (!button) {
        button = document.createElement('button')
        button.type = 'button'
        button.dataset.moniGlobalNav = 'true'
        button.dataset.moniAppearanceMenu = 'true'
        button.textContent = '화면·배경 설정'
        button.className = 'mb-1 block w-full rounded-lg px-3 py-2 text-left text-sm transition text-slate-400 hover:bg-slate-800 hover:text-slate-100'
        button.addEventListener('click', () => { window.location.href = '/settings/appearance' })
        submenu.insertBefore(button, submenu.firstChild)
      }

      const active = pathname === '/settings/appearance'
      button.className = active
        ? 'mb-1 block w-full rounded-lg bg-blue-600 px-3 py-2 text-left text-sm text-white transition'
        : 'mb-1 block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-400 transition hover:bg-slate-800 hover:text-slate-100'

      if (active) {
        const categoryButton = adminWrapper.querySelector<HTMLButtonElement>(':scope > button[data-moni-global-nav]')
        if (categoryButton) {
          categoryButton.classList.add('bg-emerald-500/15', 'text-emerald-200')
        }
      }
    }

    inject()
    const observer = new MutationObserver(inject)
    observer.observe(document.body, { childList: true, subtree: true })
    const timer = window.setInterval(inject, 800)

    return () => {
      observer.disconnect()
      window.clearInterval(timer)
      sentinel?.remove()
    }
  }, [pathname])

  return null
}
