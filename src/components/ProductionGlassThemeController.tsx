'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

const PRODUCTION_CATEGORY_LABEL = '생산관리'

function normalized(element: Element | null | undefined) {
  return (element?.textContent || '').replace(/\s+/g, ' ').trim()
}

function detectLegacyProductionView() {
  const sidebar = document.querySelector<HTMLElement>('[data-moni-global-sidebar]')
  if (!sidebar) return ''

  const categoryButtons = Array.from(sidebar.querySelectorAll<HTMLButtonElement>('nav > div > button[data-moni-global-nav]'))
  const productionButton = categoryButtons.find((button) => normalized(button).includes(PRODUCTION_CATEGORY_LABEL))
  const productionActive = Boolean(productionButton && (
    productionButton.className.includes('bg-emerald') || productionButton.className.includes('bg-blue')
  ))
  if (!productionActive) return ''

  const itemButtons = Array.from(sidebar.querySelectorAll<HTMLButtonElement>('nav button[data-moni-global-nav]'))
  const activeItem = itemButtons.find((button) => button.className.includes('bg-blue-600'))
  const label = normalized(activeItem)

  if (label.includes('생산 대시보드')) return 'dashboard'
  if (label.includes('작업지시')) return 'work-orders'
  if (label.includes('원료 수불부')) return 'raw-ledger'
  if (label.includes('제품 관리')) return 'products'
  if (label.includes('원재료 관리')) return 'raw-materials'
  if (label.includes('부재료 관리')) return 'packaging-materials'
  if (label.includes('위생점검')) return 'sanitation'
  if (label.includes('품질관리')) return 'quality'
  if (label.includes('규정준수')) return 'compliance'
  return 'legacy'
}

function applyView(pathname: string) {
  const appContent = document.querySelector<HTMLElement>('[data-moni-app-content]')
  if (!appContent) return

  let view = ''
  if (pathname === '/monthly-production-plan') view = 'monthly-plan'
  else if (pathname === '/production-daily') view = 'production-daily'
  else if (pathname === '/' && new URLSearchParams(window.location.search).get('legacy') === '1') {
    view = detectLegacyProductionView()
  }

  if (view) appContent.dataset.moniProductionView = view
  else delete appContent.dataset.moniProductionView
}

export default function ProductionGlassThemeController() {
  const pathname = usePathname()

  useEffect(() => {
    let frame = 0
    const schedule = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => applyView(pathname))
    }

    schedule()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    })
    window.addEventListener('popstate', schedule)

    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('popstate', schedule)
      const appContent = document.querySelector<HTMLElement>('[data-moni-app-content]')
      if (appContent) delete appContent.dataset.moniProductionView
    }
  }, [pathname])

  return null
}
