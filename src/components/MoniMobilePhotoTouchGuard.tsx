'use client'

import { useEffect } from 'react'

const PHOTO_BUSY_TEXT = /(사진 준비 중|사진을 안전하게 준비)/
const PHOTO_BUSY_MAX_MS = 40_000
const PHOTO_RECOVERY_KEY = 'moni-mobile-photo-stuck-recovery-at'
const RELEASE_INTERVAL_MS = 500

function isIdleInteractionState(root: HTMLElement) {
  const live = Boolean(root.querySelector('.moni-live-state-live, .moni-live-state-issue'))
  const thinking = Boolean(root.querySelector('.moni-live-state-thinking'))
  const listening = Boolean(root.querySelector('[aria-label="음성 인식 상태"]'))
  const photoBusy = PHOTO_BUSY_TEXT.test(root.textContent || '')
  return live && !thinking && !listening && !photoBusy
}

function forcePointerAuto(element: HTMLElement) {
  element.removeAttribute('inert')
  const computed = window.getComputedStyle(element)
  if (element.style.pointerEvents === 'none' || computed.pointerEvents === 'none') {
    element.style.setProperty('pointer-events', 'auto', 'important')
  }
}

function unlockPath(target: HTMLElement, root: HTMLElement) {
  let current: HTMLElement | null = target
  while (current) {
    forcePointerAuto(current)
    if (current === root) break
    current = current.parentElement
  }
}

function normalizeIdleControls(root: HTMLElement) {
  const alwaysEnabled = [
    root.querySelector<HTMLButtonElement>('.moni-new-chat-button'),
    root.querySelector<HTMLButtonElement>('button[aria-label="사진 첨부"]'),
    root.querySelector<HTMLButtonElement>('button[aria-label="음성으로 입력"]'),
    root.querySelector<HTMLTextAreaElement>('textarea'),
  ]

  alwaysEnabled.forEach((element) => {
    if (!element) return
    element.removeAttribute('inert')
    element.disabled = false
  })

  const send = root.querySelector<HTMLButtonElement>('button[aria-label="전송"]')
  const textarea = root.querySelector<HTMLTextAreaElement>('textarea')
  const hasPendingPhoto = Boolean(root.querySelector('button[aria-label$="첨부 취소"]'))
  if (send && (Boolean(textarea?.value.trim()) || hasPendingPhoto)) send.disabled = false
}

function releaseBlockerAt(target: HTMLElement, root: HTMLElement) {
  const rect = target.getBoundingClientRect()
  if (!rect.width || !rect.height) return

  unlockPath(target, root)

  const x = Math.max(0, Math.min(window.innerWidth - 1, rect.left + rect.width / 2))
  const y = Math.max(0, Math.min(window.innerHeight - 1, rect.top + rect.height / 2))

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const top = document.elementFromPoint(x, y)
    if (!top || top === target || target.contains(top)) return
    if (top instanceof HTMLElement && top.contains(target)) {
      forcePointerAuto(top)
      return
    }

    const candidate = top instanceof HTMLElement ? top : top.parentElement
    if (!candidate || candidate === root || candidate === document.body || candidate === document.documentElement) return
    if (candidate.contains(target) || target.contains(candidate)) return
    if (candidate.matches('[role="dialog"], [aria-modal="true"]') || candidate.closest('[role="dialog"], [aria-modal="true"]')) return
    if (candidate.closest('button, textarea, input, select, a[href]')) return

    const box = candidate.getBoundingClientRect()
    const coversPoint = x >= box.left && x <= box.right && y >= box.top && y <= box.bottom
    if (!coversPoint) return

    candidate.dataset.moniReleasedTouchBlocker = 'true'
    candidate.style.setProperty('pointer-events', 'none', 'important')
  }
}

function releaseInteractionSurface(root: HTMLElement) {
  forcePointerAuto(document.documentElement)
  forcePointerAuto(document.body)
  forcePointerAuto(root)

  const composer = root.querySelector<HTMLElement>('[data-moni-mobile-composer]')
  if (composer) forcePointerAuto(composer)

  normalizeIdleControls(root)

  const targets = [
    root.querySelector<HTMLElement>('.moni-new-chat-button'),
    root.querySelector<HTMLElement>('button[aria-label="사진 첨부"]'),
    root.querySelector<HTMLElement>('button[aria-label="음성으로 입력"]'),
    root.querySelector<HTMLElement>('button[aria-label="전송"]'),
    root.querySelector<HTMLElement>('textarea'),
    ...Array.from(root.querySelectorAll<HTMLElement>('.moni-answer-action')).slice(-8),
  ].filter((target): target is HTMLElement => Boolean(target))

  targets.forEach((target) => releaseBlockerAt(target, root))

  root.dataset.moniPhotoInteractionReady = 'true'
  root.dataset.moniInteractionWatchdog = 'ready'
}

export default function MoniMobilePhotoTouchGuard() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-moni-mobile-chat]')
    if (!root) return

    let wasBusy = PHOTO_BUSY_TEXT.test(root.textContent || '')
    let wasIdle = isIdleInteractionState(root)
    let releaseTimer: number | null = null
    let stuckTimer: number | null = null
    let repairing = false

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
          window.location.reload()
        } catch {
          window.location.reload()
        }
      }, PHOTO_BUSY_MAX_MS)
    }

    const repairNow = () => {
      if (repairing || !isIdleInteractionState(root)) return
      repairing = true
      try {
        releaseInteractionSurface(root)
      } finally {
        repairing = false
      }
    }

    const scheduleRelease = () => {
      window.requestAnimationFrame(repairNow)
      if (releaseTimer !== null) window.clearTimeout(releaseTimer)
      releaseTimer = window.setTimeout(() => {
        releaseTimer = null
        repairNow()
      }, 120)
    }

    const sync = () => {
      const busy = PHOTO_BUSY_TEXT.test(root.textContent || '')
      const idle = isIdleInteractionState(root)
      if (busy) armStuckRecovery()
      else clearStuckTimer()
      if ((wasBusy && !busy) || (!wasIdle && idle) || idle) scheduleRelease()
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
      if (isIdleInteractionState(root)) repairNow()
    }

    const observer = new MutationObserver(sync)
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['class', 'style', 'inert', 'disabled'],
      childList: true,
      subtree: true,
      characterData: true,
    })
    window.addEventListener('focus', recoverIfIdle)
    window.addEventListener('pageshow', recoverIfIdle)
    document.addEventListener('visibilitychange', onVisibility)
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('touchstart', onPointerDown, true)
    root.querySelectorAll<HTMLInputElement>('input[type="file"]').forEach((input) => input.addEventListener('change', scheduleRelease))

    const releaseInterval = window.setInterval(repairNow, RELEASE_INTERVAL_MS)

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
