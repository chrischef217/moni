'use client'

import { useEffect } from 'react'

const PHOTO_BUSY_TEXT = /(사진 준비 중|사진을 안전하게 준비)/
const PHOTO_BUSY_MAX_MS = 40_000
const PHOTO_RECOVERY_KEY = 'moni-mobile-photo-stuck-recovery-at'
const RELEASE_INTERVAL_MS = 700

function isIdleInteractionState(root: HTMLElement) {
  const live = Boolean(root.querySelector('.moni-live-state-live, .moni-live-state-issue'))
  const thinking = Boolean(root.querySelector('.moni-live-state-thinking'))
  const listening = Boolean(root.querySelector('[aria-label="음성 인식 상태"]'))
  const photoBusy = PHOTO_BUSY_TEXT.test(root.textContent || '')
  return live && !thinking && !listening && !photoBusy
}

function releaseInteractionSurface(root: HTMLElement) {
  root.removeAttribute('inert')
  if (root.style.pointerEvents === 'none') root.style.removeProperty('pointer-events')

  const composer = root.querySelector<HTMLElement>('[data-moni-mobile-composer]')
  if (composer) {
    composer.removeAttribute('inert')
    if (composer.style.pointerEvents === 'none') composer.style.removeProperty('pointer-events')
  }

  root.querySelectorAll<HTMLElement>('button, textarea, input, a').forEach((element) => {
    element.removeAttribute('inert')
    if (element.style.pointerEvents === 'none') element.style.removeProperty('pointer-events')
  })

  document.body.removeAttribute('inert')
  document.documentElement.removeAttribute('inert')
  if (document.body.style.pointerEvents === 'none') document.body.style.removeProperty('pointer-events')
  if (document.documentElement.style.pointerEvents === 'none') document.documentElement.style.removeProperty('pointer-events')

  const releaseTransparentBlocker = (target: Element | null) => {
    if (!(target instanceof HTMLElement)) return
    const rect = target.getBoundingClientRect()
    if (!rect.width || !rect.height) return

    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    if (!top || top === target || target.contains(top)) return

    let candidate = top instanceof HTMLElement ? top : top.parentElement
    while (candidate && candidate !== document.body && candidate !== root) {
      if (candidate === target || candidate.contains(target)) return
      if (candidate.matches('[role="dialog"], [aria-modal="true"]') || candidate.querySelector('[role="dialog"], [aria-modal="true"]')) return

      const style = window.getComputedStyle(candidate)
      const box = candidate.getBoundingClientRect()
      const coversViewport = box.width >= window.innerWidth * 0.85 && box.height >= window.innerHeight * 0.85
      if (style.position === 'fixed' && coversViewport && style.pointerEvents !== 'none') {
        candidate.dataset.moniPhotoReleasedBlocker = 'true'
        candidate.style.pointerEvents = 'none'
        return
      }
      candidate = candidate.parentElement
    }
  }

  releaseTransparentBlocker(root.querySelector('button[aria-label="전송"]'))
  releaseTransparentBlocker(root.querySelector('button[aria-label="사진 첨부"]'))
  releaseTransparentBlocker(root.querySelector('.moni-new-chat-button'))
  releaseTransparentBlocker(root.querySelector('textarea'))
  root.dataset.moniPhotoInteractionReady = 'true'
}

export default function MoniMobilePhotoTouchGuard() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-moni-mobile-chat]')
    if (!root) return

    let wasBusy = PHOTO_BUSY_TEXT.test(root.textContent || '')
    let wasIdle = isIdleInteractionState(root)
    let releaseTimer: number | null = null
    let stuckTimer: number | null = null

    const clearStuckTimer = () => {
      if (stuckTimer !== null) window.clearTimeout(stuckTimer)
      stuckTimer = null
    }

    const armStuckRecovery = () => {
      if (stuckTimer !== null) return
      stuckTimer = window.setTimeout(() => {
        stuckTimer = null
        if (!PHOTO_BUSY_TEXT.test(root.textContent || '')) return
        releaseInteractionSurface(root)
        try {
          const now = Date.now()
          const last = Number(window.sessionStorage.getItem(PHOTO_RECOVERY_KEY) || 0)
          if (last && now - last < 60_000) return
          window.sessionStorage.setItem(PHOTO_RECOVERY_KEY, String(now))
          // READY-but-unlinked attachments are restored by MoniMobileChat after reload,
          // so a stalled picker/upload state cannot leave the entire composer disabled forever.
          window.location.reload()
        } catch {
          window.location.reload()
        }
      }, PHOTO_BUSY_MAX_MS)
    }

    const scheduleRelease = () => {
      window.requestAnimationFrame(() => releaseInteractionSurface(root))
      if (releaseTimer !== null) window.clearTimeout(releaseTimer)
      releaseTimer = window.setTimeout(() => {
        releaseTimer = null
        releaseInteractionSurface(root)
      }, 180)
    }

    const sync = () => {
      const busy = PHOTO_BUSY_TEXT.test(root.textContent || '')
      const idle = isIdleInteractionState(root)
      if (busy) armStuckRecovery()
      else clearStuckTimer()
      if ((wasBusy && !busy) || (!wasIdle && idle)) scheduleRelease()
      wasBusy = busy
      wasIdle = idle
    }

    const recoverIfIdle = () => {
      if (isIdleInteractionState(root)) scheduleRelease()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') recoverIfIdle()
    }
    const onPointerDown = () => {
      if (isIdleInteractionState(root)) releaseInteractionSurface(root)
    }

    const observer = new MutationObserver(sync)
    observer.observe(root, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true, characterData: true })
    window.addEventListener('focus', recoverIfIdle)
    window.addEventListener('pageshow', recoverIfIdle)
    document.addEventListener('visibilitychange', onVisibility)
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('touchstart', onPointerDown, true)
    root.querySelectorAll<HTMLInputElement>('input[type="file"]').forEach((input) => input.addEventListener('change', scheduleRelease))

    const releaseInterval = window.setInterval(() => {
      if (isIdleInteractionState(root)) releaseInteractionSurface(root)
    }, RELEASE_INTERVAL_MS)

    sync()
    scheduleRelease()

    return () => {
      observer.disconnect()
      window.removeEventListener('focus', recoverIfIdle)
      window.removeEventListener('pageshow', recoverIfIdle)
      document.removeEventListener('visibilitychange', onVisibility)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('touchstart', onPointerDown, true)
      root.querySelectorAll<HTMLInputElement>('input[type="file"]').forEach((input) => input.removeEventListener('change', scheduleRelease))
      window.clearInterval(releaseInterval)
      if (releaseTimer !== null) window.clearTimeout(releaseTimer)
      clearStuckTimer()
    }
  }, [])
  return null
}
