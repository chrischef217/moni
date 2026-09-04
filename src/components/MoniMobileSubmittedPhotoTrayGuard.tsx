'use client'

import { useEffect } from 'react'

const TURN_START_EVENT = 'moni:user-turn-start'
const PHOTO_CANCEL_SELECTOR = 'button[aria-label$="첨부 취소"]'

function photoTrays(root: HTMLElement) {
  const trays = new Set<HTMLElement>()
  root.querySelectorAll<HTMLButtonElement>(PHOTO_CANCEL_SELECTOR).forEach((button) => {
    const thumbnail = button.parentElement
    const tray = thumbnail?.parentElement
    if (tray instanceof HTMLElement) trays.add(tray)
  })
  return [...trays]
}

function hideSubmittedTrays(root: HTMLElement) {
  photoTrays(root).forEach((tray) => {
    tray.dataset.moniSubmittedPhotoTray = 'true'
    tray.style.display = 'none'
    tray.setAttribute('aria-hidden', 'true')
  })
}

function restoreSubmittedTrays(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('[data-moni-submitted-photo-tray="true"]').forEach((tray) => {
    tray.style.removeProperty('display')
    tray.removeAttribute('aria-hidden')
    delete tray.dataset.moniSubmittedPhotoTray
  })
}

export default function MoniMobileSubmittedPhotoTrayGuard() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-moni-mobile-chat]')
    if (!root) return

    let restoreTimer: number | null = null

    const onTurnStart = () => {
      if (restoreTimer !== null) window.clearTimeout(restoreTimer)
      window.requestAnimationFrame(() => hideSubmittedTrays(root))
      // A submitted attachment is already represented in the user message. Keep the
      // composer clean while the request is running. If the request fails and the
      // pending state is still present, restore it so the user can retry.
      restoreTimer = window.setTimeout(() => {
        restoreTimer = null
        const hasIssue = Boolean(root.querySelector('.moni-live-state-issue')) || /MONI 연결 오류|응답을 받지 못했습니다|문제가 발생/.test(root.textContent || '')
        if (hasIssue) restoreSubmittedTrays(root)
      }, 1200)
    }

    const observer = new MutationObserver(() => {
      const hasIssue = Boolean(root.querySelector('.moni-live-state-issue'))
      if (hasIssue) restoreSubmittedTrays(root)
    })
    observer.observe(root, { childList: true, subtree: true, characterData: true })
    window.addEventListener(TURN_START_EVENT, onTurnStart as EventListener)

    return () => {
      window.removeEventListener(TURN_START_EVENT, onTurnStart as EventListener)
      observer.disconnect()
      if (restoreTimer !== null) window.clearTimeout(restoreTimer)
      restoreSubmittedTrays(root)
    }
  }, [])

  return null
}
