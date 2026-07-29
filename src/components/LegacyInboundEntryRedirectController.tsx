'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

const PURCHASE_RECEIPT_HREF = '/business-management?tab=purchase&view=purchases'
const RETIRED_LABELS = new Set(['수동 입고 등록', '엑셀 입고 등록', '부재료 입고 등록'])

function exactText(element: Element | null) {
  return (element?.textContent || '').replace(/\s+/g, ' ').trim()
}

function makePurchaseButton(onClick: () => void) {
  const button = document.createElement('button')
  button.type = 'button'
  button.dataset.moniPurchaseReceiptLink = 'true'
  button.textContent = '매입·입고 등록'
  button.className = 'rounded-xl border border-sky-500/60 bg-sky-500/15 px-4 py-2 text-sm font-semibold text-sky-100 hover:border-sky-400 hover:bg-sky-500/25 hover:text-white'
  button.addEventListener('click', onClick)
  return button
}

export default function LegacyInboundEntryRedirectController() {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (pathname !== '/') return
    let frame: number | null = null
    let disposed = false

    const moveToPurchase = () => router.push(PURCHASE_RECEIPT_HREF)

    const apply = () => {
      if (disposed) return
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      const retired = buttons.filter((button) => RETIRED_LABELS.has(exactText(button)))
      const hosts = new Set<HTMLElement>()

      for (const button of retired) {
        if (button.parentElement) hosts.add(button.parentElement)
        button.remove()
      }

      for (const host of Array.from(hosts)) {
        if (host.querySelector('[data-moni-purchase-receipt-link]')) continue
        host.append(makePurchaseButton(moveToPurchase))
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
    const timers = [80, 250, 700, 1500].map((delay) => window.setTimeout(apply, delay))

    return () => {
      disposed = true
      observer.disconnect()
      timers.forEach((timer) => window.clearTimeout(timer))
      if (frame !== null) window.cancelAnimationFrame(frame)
    }
  }, [pathname, router])

  return null
}
