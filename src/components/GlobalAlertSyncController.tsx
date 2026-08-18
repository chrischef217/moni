'use client'

import { useEffect } from 'react'

const STORAGE_KEY = 'moni-alert-sync-v10'
const SYNC_INTERVAL_MS = 10 * 60 * 1000
const INITIAL_SYNC_DELAY_MS = 8 * 1000

function lastSyncedAt() {
  try {
    return Number(window.sessionStorage.getItem(STORAGE_KEY) || 0)
  } catch {
    return 0
  }
}

function rememberSync() {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, String(Date.now()))
  } catch {
    // Best-effort throttle only.
  }
}

export default function GlobalAlertSyncController() {
  useEffect(() => {
    let cancelled = false
    let redirecting = false

    const recoverExpiredSession = () => {
      if (redirecting || cancelled) return
      redirecting = true
      try {
        window.sessionStorage.setItem('moni-session-expired-at', String(Date.now()))
      } catch {
        // Best effort only.
      }
      window.location.reload()
    }

    const sync = async (force = false) => {
      if (document.visibilityState !== 'visible') return
      if (!force && Date.now() - lastSyncedAt() < SYNC_INTERVAL_MS) return
      try {
        const response = await fetch('/api/moni/alerts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'sync_intelligence' }),
        })
        if (cancelled) return
        if (response.status === 401 || response.status === 403) {
          recoverExpiredSession()
          return
        }
        if (!response.ok) return
        rememberSync()
        window.dispatchEvent(new CustomEvent('moni-alerts-synced'))
      } catch {
        // Network loss must not eject an otherwise-valid session.
      }
    }

    const first = window.setTimeout(() => void sync(), INITIAL_SYNC_DELAY_MS)
    const timer = window.setInterval(() => void sync(true), SYNC_INTERVAL_MS)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void sync(true)
    }
    const onFocus = () => void sync(true)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)

    return () => {
      cancelled = true
      window.clearTimeout(first)
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  return null
}
