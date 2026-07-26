'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SidebarAdminMenuController() {
  const router = useRouter()

  useEffect(() => {
    let adminButton: HTMLButtonElement | null = null
    let observer: MutationObserver | null = null

    function handleClick(event: MouseEvent) {
      event.preventDefault()
      event.stopPropagation()
      router.push('/settings/appearance?section=company')
    }

    const bind = () => {
      const next = document.querySelector<HTMLButtonElement>("[data-moni-global-sidebar] button[aria-label='관리자']")
      if (!next || next === adminButton) return

      if (adminButton) adminButton.removeEventListener('click', handleClick, true)
      adminButton = next
      adminButton.addEventListener('click', handleClick, true)
    }

    bind()
    observer = new MutationObserver(bind)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      observer?.disconnect()
      if (adminButton) adminButton.removeEventListener('click', handleClick, true)
    }
  }, [router])

  return null
}
