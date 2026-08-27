'use client'

import { useEffect } from 'react'

const KEEP_ALIVE_MS = 10 * 60 * 1000

export default function AllowanceSessionKeepAlive() {
  useEffect(() => {
    let disposed = false
    let timer: number | null = null
    let inFlight = false

    const keepAlive = async () => {
      if (disposed || inFlight) return
      inFlight = true
      try {
        await fetch('/api/allowance/auth/session', {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'x-moni-session-keepalive': '1' },
        })
      } catch {
        // A temporary network interruption must never reset or navigate the UI.
        // The next interval/focus/online event will retry automatically.
      } finally {
        inFlight = false
      }
    }

    const schedule = () => {
      if (timer !== null) window.clearInterval(timer)
      timer = window.setInterval(keepAlive, KEEP_ALIVE_MS)
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void keepAlive()
    }
    const onFocus = () => void keepAlive()
    const onOnline = () => void keepAlive()

    // Run immediately so users who logged in before this deployment have their
    // old fixed 30-minute cookie upgraded without requiring another login.
    void keepAlive()
    schedule()

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onOnline)

    return () => {
      disposed = true
      if (timer !== null) window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onOnline)
    }
  }, [])

  return null
}
