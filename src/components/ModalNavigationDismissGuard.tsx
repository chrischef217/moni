'use client'

import { useEffect } from 'react'

function normalizedText(element: Element | null) {
  return (element?.textContent || '').replace(/\s+/g, ' ').trim()
}

function isVisible(element: HTMLElement) {
  const style = window.getComputedStyle(element)
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
}

function dismissOpenWorkModals() {
  const overlays = Array.from(document.querySelectorAll<HTMLElement>(
    "[data-moni-app-content] .fixed.inset-0, [data-moni-ledger-detail-modal='true']",
  )).filter((overlay, index, all) => all.indexOf(overlay) === index && isVisible(overlay))

  for (const overlay of overlays) {
    const buttons = Array.from(overlay.querySelectorAll<HTMLButtonElement>('button')).filter(isVisible)
    const closeButton = buttons.find((button) => normalizedText(button) === '닫기')
      || buttons.find((button) => normalizedText(button) === '취소')

    // Use the component's own close/cancel handler instead of removing DOM nodes.
    // This resets the React modal state so the old modal cannot survive a same-route
    // legacy menu transition.
    closeButton?.click()
  }
}

export default function ModalNavigationDismissGuard() {
  useEffect(() => {
    const isSidebarNavigation = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false
      const sidebar = target.closest('[data-moni-global-sidebar]')
      if (!sidebar) return false

      const control = target.closest<HTMLElement>('button, a')
      if (!control || !sidebar.contains(control)) return false

      // Pin/unpin changes layout only; it is not menu navigation.
      if (control.matches('button[aria-pressed]')) return false
      return true
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!isSidebarNavigation(event.target)) return
      dismissOpenWorkModals()
    }

    const onClick = (event: MouseEvent) => {
      if (!isSidebarNavigation(event.target)) return
      // Keyboard-initiated clicks do not have pointerdown. This is also a safe
      // fallback when a modal was mounted between pointerdown and click.
      dismissOpenWorkModals()
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('click', onClick, true)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('click', onClick, true)
    }
  }, [])

  return null
}
