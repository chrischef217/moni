'use client'

import { useEffect } from 'react'

const PHOTO_BUSY_TEXT = /(사진 준비 중|사진을 안전하게 준비)/
const PHOTO_BUSY_MAX_MS = 40_000
const PHOTO_RECOVERY_KEY = 'moni-mobile-photo-stuck-recovery-at'
const NEW_CHAT_SELECTOR = '.moni-new-chat-button'
const SEND_SELECTOR = 'button[aria-label="전송"]'

function isPhotoBusy(root: HTMLElement) {
  return PHOTO_BUSY_TEXT.test(root.textContent || '')
}

function isSettledInteractionState(root: HTMLElement) {
  const live = Boolean(root.querySelector('.moni-live-state-live, .moni-live-state-issue'))
  const thinking = Boolean(root.querySelector('.moni-live-state-thinking'))
  const listening = Boolean(root.querySelector('[aria-label="음성 인식 상태"]'))
  return live && !thinking && !listening && !isPhotoBusy(root)
}

function clearExplicitLock(element: HTMLElement | null) {
  if (!element) return
  element.removeAttribute('inert')
  if (element.style.pointerEvents === 'none') element.style.removeProperty('pointer-events')
}

function releaseKnownStaleLocks(root: HTMLElement) {
  clearExplicitLock(document.documentElement)
  clearExplicitLock(document.body)
  clearExplicitLock(root)
  clearExplicitLock(root.querySelector<HTMLElement>('[data-moni-mobile-composer]'))

  // Earlier recovery guards tagged blockers before setting pointer-events:none.
  // Restore only blockers MONI itself tagged; never mutate arbitrary live UI layers.
  root.querySelectorAll<HTMLElement>([
    '[data-moni-released-touch-blocker="true"]',
    '[data-moni-photo-released-blocker="true"]',
    '[data-moni-voice-released-blocker="true"]',
  ].join(',')).forEach((element) => {
    if (element.style.pointerEvents === 'none') element.style.removeProperty('pointer-events')
    delete element.dataset.moniReleasedTouchBlocker
    delete element.dataset.moniPhotoReleasedBlocker
    delete element.dataset.moniVoiceReleasedBlocker
  })

  root.dataset.moniPhotoInteractionReady = 'true'
  root.dataset.moniInteractionWatchdog = 'passive'
}

function rectContains(element: HTMLElement, x: number, y: number) {
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0 && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

function controlAtPoint(root: HTMLElement, x: number, y: number) {
  const controls = [
    root.querySelector<HTMLButtonElement>(NEW_CHAT_SELECTOR),
    root.querySelector<HTMLButtonElement>(SEND_SELECTOR),
  ].filter((item): item is HTMLButtonElement => Boolean(item))
  return controls.find((control) => rectContains(control, x, y)) || null
}

function canSubmit(root: HTMLElement) {
  const textarea = root.querySelector<HTMLTextAreaElement>('textarea')
  const hasText = Boolean(textarea?.value.trim())
  const hasPendingPhoto = Boolean(root.querySelector('button[aria-label$="첨부 취소"]'))
  return hasText || hasPendingPhoto
}

function recoverCoreControl(root: HTMLElement, control: HTMLButtonElement) {
  if (!isSettledInteractionState(root)) return false

  if (control.matches(NEW_CHAT_SELECTOR)) {
    if (control.disabled) control.disabled = false
    return true
  }

  if (control.matches(SEND_SELECTOR) && canSubmit(root)) {
    if (control.disabled) control.disabled = false
    return true
  }

  return false
}

function activateRecoveredControl(control: HTMLButtonElement) {
  if (control.matches(SEND_SELECTOR)) {
    const form = control.closest('form')
    if (form instanceof HTMLFormElement) {
      form.requestSubmit(control)
      return
    }
  }
  control.click()
}

export default function MoniMobilePhotoTouchGuard() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-moni-mobile-chat]')
    if (!root) return

    const supportsPointerEvents = typeof window.PointerEvent !== 'undefined'
    let wasBusy = isPhotoBusy(root)
    let stuckTimer: number | null = null
    let lastSyntheticAt = 0

    const clearStuckTimer = () => {
      if (stuckTimer !== null) window.clearTimeout(stuckTimer)
      stuckTimer = null
    }

    const armStuckRecovery = () => {
      if (stuckTimer !== null) return
      stuckTimer = window.setTimeout(() => {
        stuckTimer = null
        if (!isPhotoBusy(root)) return
        releaseKnownStaleLocks(root)
        try {
          const now = Date.now()
          const last = Number(window.sessionStorage.getItem(PHOTO_RECOVERY_KEY) || 0)
          if (last && now - last < 60_000) return
          window.sessionStorage.setItem(PHOTO_RECOVERY_KEY, String(now))
          window.location.reload()
        } catch {
          window.location.reload()
        }
      }, PHOTO_BUSY_MAX_MS)
    }

    const syncPhotoState = () => {
      const busy = isPhotoBusy(root)
      if (busy) armStuckRecovery()
      else clearStuckTimer()
      if (wasBusy && !busy) window.requestAnimationFrame(() => releaseKnownStaleLocks(root))
      wasBusy = busy
    }

    const recoverOnReturn = () => {
      if (document.visibilityState === 'visible') window.requestAnimationFrame(() => releaseKnownStaleLocks(root))
    }

    const handlePointer = (event: PointerEvent) => {
      const direct = event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>(`${NEW_CHAT_SELECTOR}, ${SEND_SELECTOR}`)
        : null
      const control = direct && root.contains(direct)
        ? direct
        : controlAtPoint(root, event.clientX, event.clientY)
      if (!control || !recoverCoreControl(root, control)) return

      releaseKnownStaleLocks(root)

      // If the tap already landed on the real control, simply remove stale disabled/lock
      // state and allow the browser/React click to continue normally. Only synthesize an
      // activation when another layer intercepted the tap at the same screen coordinates.
      if (direct === control) return

      const now = Date.now()
      if (now - lastSyntheticAt < 350) return
      lastSyntheticAt = now
      event.preventDefault()
      event.stopPropagation()
      window.setTimeout(() => activateRecoveredControl(control), 0)
    }

    const handleLegacyTouch = (event: TouchEvent) => {
      if (event.touches.length !== 1) return
      const touch = event.touches[0]
      const control = controlAtPoint(root, touch.clientX, touch.clientY)
      if (!control || !recoverCoreControl(root, control)) return
      releaseKnownStaleLocks(root)

      const direct = event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>(`${NEW_CHAT_SELECTOR}, ${SEND_SELECTOR}`)
        : null
      if (direct === control) return

      const now = Date.now()
      if (now - lastSyntheticAt < 350) return
      lastSyntheticAt = now
      event.preventDefault()
      event.stopPropagation()
      window.setTimeout(() => activateRecoveredControl(control), 0)
    }

    const observer = new MutationObserver(syncPhotoState)
    observer.observe(root, { childList: true, subtree: true, characterData: true })
    window.addEventListener('focus', recoverOnReturn)
    window.addEventListener('pageshow', recoverOnReturn)
    document.addEventListener('visibilitychange', recoverOnReturn)
    document.addEventListener('pointerdown', handlePointer, true)
    if (!supportsPointerEvents) document.addEventListener('touchstart', handleLegacyTouch, true)

    syncPhotoState()
    releaseKnownStaleLocks(root)

    return () => {
      observer.disconnect()
      window.removeEventListener('focus', recoverOnReturn)
      window.removeEventListener('pageshow', recoverOnReturn)
      document.removeEventListener('visibilitychange', recoverOnReturn)
      document.removeEventListener('pointerdown', handlePointer, true)
      if (!supportsPointerEvents) document.removeEventListener('touchstart', handleLegacyTouch, true)
      clearStuckTimer()
    }
  }, [])

  return null
}
