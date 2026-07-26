'use client'

import { useEffect } from 'react'

export default function SidebarExportDestinationLabelController() {
  useEffect(() => {
    let frame: number | null = null

    const apply = () => {
      frame = null
      const sidebar = document.querySelector<HTMLElement>('[data-moni-global-sidebar]')
      if (!sidebar) return

      const buttons = Array.from(sidebar.querySelectorAll<HTMLButtonElement>('button[data-moni-global-nav]'))
      for (const button of buttons) {
        if ((button.textContent || '').replace(/\s+/g, ' ').trim() === '수출 관리') {
          button.textContent = '수출처 관리'
        }
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
