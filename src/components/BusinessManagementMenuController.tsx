'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

function normalized(element: Element) {
  return (element.textContent || '').replace(/\s+/g, ' ').trim()
}

export default function BusinessManagementMenuController() {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (pathname !== '/') return

    const bindDirectRoute = (button: HTMLButtonElement, label: string, href: string) => {
      const labelNode = Array.from(button.querySelectorAll('span')).find((node) => node.className.includes('flex-1'))
      if (labelNode && labelNode.textContent !== label) labelNode.textContent = label
      if (!labelNode && normalized(button) !== label) button.textContent = label

      const wrapper = button.parentElement
      const submenu = wrapper?.children.item(1) as HTMLElement | null
      if (submenu) submenu.style.display = 'none'

      if (button.dataset.businessManagementBound === href) return
      button.dataset.businessManagementBound = href
      button.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopImmediatePropagation()
        router.push(href)
      }, true)
    }

    const apply = () => {
      const nav = document.querySelector<HTMLElement>('[data-moni-global-sidebar] nav')
      if (!nav) return
      const categoryButtons = Array.from(nav.querySelectorAll<HTMLButtonElement>('button[data-moni-global-nav]'))
      const accountingButton = categoryButtons.find((button) => normalized(button).includes('회계관리') || normalized(button).includes('회계·세무관리'))
      const salesButton = categoryButtons.find((button) => normalized(button).includes('영업관리'))

      if (accountingButton) bindDirectRoute(accountingButton, '회계·세무관리', '/business-management?tab=accounting')
      if (salesButton) bindDirectRoute(salesButton, '영업관리', '/business-management?tab=sales')

      if (!nav.querySelector('[data-business-management-hr]')) {
        const reference = accountingButton?.parentElement || salesButton?.parentElement
        if (!reference) return
        const wrapper = document.createElement('div')
        wrapper.dataset.businessManagementHr = 'true'
        wrapper.className = 'mb-1'
        const button = document.createElement('button')
        button.type = 'button'
        button.dataset.moniGlobalNav = 'true'
        button.className = 'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-semibold text-slate-200 transition hover:bg-slate-800/80 hover:text-white'
        button.innerHTML = '<span class="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800">♙</span><span class="flex-1">인사관리</span>'
        button.addEventListener('click', () => router.push('/business-management?tab=hr'))
        wrapper.appendChild(button)
        nav.insertBefore(wrapper, reference)
      }
    }

    apply()
    const observer = new MutationObserver(apply)
    observer.observe(document.body, { childList: true, subtree: true })
    const timer = window.setInterval(apply, 300)
    return () => {
      observer.disconnect()
      window.clearInterval(timer)
    }
  }, [pathname, router])

  return null
}
