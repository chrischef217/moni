'use client'

import { useEffect } from 'react'

const ATTRIBUTE = 'data-monthly-production-plan-nav'

function installLink() {
  if (location.pathname === '/monthly-production-plan') return
  if (document.querySelector(`[${ATTRIBUTE}]`)) return
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('button, a'))
  const ledger = candidates.find((element) => element.textContent?.trim() === '원료수불부' || element.textContent?.trim() === '원료 수불부')
  if (!ledger?.parentElement) return

  const link = document.createElement('a')
  link.href = '/monthly-production-plan'
  link.setAttribute(ATTRIBUTE, 'true')
  link.className = ledger.className
  link.style.display = 'flex'
  link.style.alignItems = 'center'
  link.style.gap = '0.5rem'
  link.textContent = '월간 생산계획'
  ledger.parentElement.insertBefore(link, ledger.nextSibling)
}

export default function MonthlyProductionPlanNavController() {
  useEffect(() => {
    let frame = 0
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(installLink)
    }
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
    schedule()
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      document.querySelectorAll(`[${ATTRIBUTE}]`).forEach((element) => element.remove())
    }
  }, [])
  return null
}
