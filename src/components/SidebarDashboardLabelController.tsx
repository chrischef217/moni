'use client'

import { useEffect } from 'react'

const DASHBOARD_LABELS: Record<string, string> = {
  '경영 Control Tower': '경영 종합현황',
  'MONI Intelligence': '인공지능 경영분석',
}

function normalizedText(element: Element) {
  return (element.textContent || '').replace(/\s+/g, ' ').trim()
}

export default function SidebarDashboardLabelController() {
  useEffect(() => {
    let frame: number | null = null

    const apply = () => {
      frame = null
      const sidebar = document.querySelector<HTMLElement>('[data-moni-global-sidebar]')
      if (!sidebar) return

      const buttons = Array.from(sidebar.querySelectorAll<HTMLButtonElement>('button[data-moni-global-nav]'))
      for (const button of buttons) {
        const replacement = DASHBOARD_LABELS[normalizedText(button)]
        if (replacement) button.textContent = replacement
      }
    }

    const schedule = () => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(apply)
    }

    apply()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })

    return () => {
      observer.disconnect()
      if (frame !== null) window.cancelAnimationFrame(frame)
    }
  }, [])

  return null
}
