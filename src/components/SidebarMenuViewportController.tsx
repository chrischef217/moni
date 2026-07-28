'use client'

import { useEffect } from 'react'

const SIDEBAR_SELECTOR = '[data-moni-global-sidebar]'
const SALES_CATEGORY_CLASS = 'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-semibold transition text-slate-200 hover:bg-slate-800/80 hover:text-white'
const SALES_ICON_CLASS = 'flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800'

function normalizeSalesCategory(nav: HTMLElement) {
  const categoryButton = nav.querySelector<HTMLButtonElement>('[data-sales-management-category]')
  const categoryIcon = nav.querySelector<HTMLElement>('[data-sales-management-icon]')

  if (categoryButton && categoryButton.className !== SALES_CATEGORY_CLASS) {
    categoryButton.className = SALES_CATEGORY_CLASS
  }
  if (categoryButton) {
    categoryButton.style.removeProperty('background')
    categoryButton.style.removeProperty('background-color')
    categoryButton.style.removeProperty('color')
  }

  if (categoryIcon && categoryIcon.className !== SALES_ICON_CLASS) {
    categoryIcon.className = SALES_ICON_CLASS
  }
  if (categoryIcon) {
    categoryIcon.style.removeProperty('background')
    categoryIcon.style.removeProperty('background-color')
    categoryIcon.style.removeProperty('color')
  }
}

export default function SidebarMenuViewportController() {
  useEffect(() => {
    let nav: HTMLElement | null = null
    let navObserver: MutationObserver | null = null
    let bodyObserver: MutationObserver | null = null
    let frame: number | null = null

    const apply = () => {
      frame = null
      if (nav) normalizeSalesCategory(nav)
    }

    const schedule = () => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(apply)
    }

    const attach = () => {
      const sidebar = document.querySelector<HTMLElement>(SIDEBAR_SELECTOR)
      const nextNav = sidebar?.querySelector<HTMLElement>('nav') ?? null
      if (nextNav === nav) return

      navObserver?.disconnect()
      nav = nextNav
      if (!nav) return

      navObserver = new MutationObserver(schedule)
      navObserver.observe(nav, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
      })
      schedule()
    }

    attach()
    bodyObserver = new MutationObserver(() => {
      attach()
      schedule()
    })
    bodyObserver.observe(document.body, { childList: true, subtree: true })
    document.addEventListener('click', schedule, true)
    window.addEventListener('popstate', schedule)

    const timers = [0, 100, 300, 800].map((delay) => window.setTimeout(schedule, delay))

    return () => {
      navObserver?.disconnect()
      bodyObserver?.disconnect()
      if (frame !== null) window.cancelAnimationFrame(frame)
      timers.forEach((timer) => window.clearTimeout(timer))
      document.removeEventListener('click', schedule, true)
      window.removeEventListener('popstate', schedule)
    }
  }, [])

  return (
    <style jsx global>{`
      [data-moni-global-sidebar] [data-sales-management-category] {
        background: transparent !important;
        color: rgb(var(--moni-glass-text)) !important;
      }

      [data-moni-global-sidebar] [data-sales-management-icon] {
        background: rgb(255 255 255 / 0.62) !important;
        color: rgb(var(--moni-glass-text)) !important;
      }
    `}</style>
  )
}
