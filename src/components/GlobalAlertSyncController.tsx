'use client'

import { useEffect } from 'react'

const STORAGE_KEY = 'moni-alert-sync-v10'
const SYNC_INTERVAL_MS = 15 * 60 * 1000

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

    const sync = async (force = false) => {
      if (!force && Date.now() - lastSyncedAt() < SYNC_INTERVAL_MS) return
      try {
        const response = await fetch('/api/moni/alerts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'sync_intelligence' }),
        })
        if (!response.ok || cancelled) return
        rememberSync()
        window.dispatchEvent(new CustomEvent('moni-alerts-synced'))
      } catch {
        // Persistent alert sync must never block normal MONI operation.
      }
    }

    const first = window.setTimeout(() => void sync(), 1800)
    const timer = window.setInterval(() => void sync(true), SYNC_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearTimeout(first)
      window.clearInterval(timer)
    }
  }, [])

  return null
}
