'use client'

import { useEffect, useState } from 'react'

const PIN_STORAGE_KEY = 'moni-sidebar-pinned'
const CHROME_RECOVERY_KEY = 'moni-admin-chrome-recovery-at'
const RECOVERY_COOLDOWN_MS = 15000

function isDesktopViewport() {
  return window.matchMedia('(min-width: 1024px)').matches
}

function hasAdminSurface() {
  return Boolean(document.querySelector('[data-moni-control-tower]'))
}

function hasLoginSurface() {
  return Boolean(document.querySelector('[data-moni-login]'))
}

function hasGlobalSidebar() {
  return Boolean(document.querySelector('[data-moni-global-sidebar]'))
}

export default function AdminChromeRecoveryController() {
  const [showRecoveryButton, setShowRecoveryButton] = useState(false)
  const [recoveryLabel, setRecoveryLabel] = useState('메뉴 열기')

  useEffect(() => {
    let frame: number | null = null

    const sync = () => {
      frame = null

      const sidebarExists = hasGlobalSidebar()
      const adminChromeMissing = hasAdminSurface() && !hasLoginSurface() && !sidebarExists
      const sidebarWasUnpinned = window.localStorage.getItem(PIN_STORAGE_KEY) === 'false'
      const shouldShowPinnedRecovery = sidebarExists && isDesktopViewport() && sidebarWasUnpinned

      if (adminChromeMissing) {
        const now = Date.now()
        const lastRecovery = Number(window.sessionStorage.getItem(CHROME_RECOVERY_KEY) || 0)

        if (!lastRecovery || now - lastRecovery > RECOVERY_COOLDOWN_MS) {
          window.sessionStorage.setItem(CHROME_RECOVERY_KEY, String(now))
          window.location.reload()
          return
        }

        setRecoveryLabel('메뉴 복구')
        setShowRecoveryButton(true)
        return
      }

      if (sidebarExists) {
        window.sessionStorage.removeItem(CHROME_RECOVERY_KEY)
      }

      setRecoveryLabel('메뉴 열기')
      setShowRecoveryButton(shouldShowPinnedRecovery)
    }

    const scheduleSync = () => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(sync)
    }

    sync()

    const observer = new MutationObserver(scheduleSync)
    observer.observe(document.body, { childList: true, subtree: true })

    window.addEventListener('resize', scheduleSync)
    window.addEventListener('storage', scheduleSync)

    return () => {
      observer.disconnect()
      if (frame !== null) window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', scheduleSync)
      window.removeEventListener('storage', scheduleSync)
    }
  }, [])

  if (!showRecoveryButton) return null

  return (
    <button
      type="button"
      aria-label={recoveryLabel}
      title={recoveryLabel}
      onClick={() => {
        window.localStorage.setItem(PIN_STORAGE_KEY, 'true')
        window.sessionStorage.removeItem(CHROME_RECOVERY_KEY)
        window.location.reload()
      }}
      className="fixed left-3 top-3 z-[1200] hidden min-h-11 items-center gap-2 rounded-xl border border-emerald-300/70 bg-[#07172c] px-3 py-2 text-sm font-extrabold text-white shadow-2xl lg:flex"
    >
      <span aria-hidden="true" className="text-xl leading-none">☰</span>
      <span>{recoveryLabel}</span>
    </button>
  )
}
