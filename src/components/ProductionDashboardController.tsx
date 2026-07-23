'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import ProductionDashboardPanel from '@/components/ProductionDashboardPanel'

const HOST_ATTR = 'data-production-dashboard-host'
const LEGACY_ATTR = 'data-production-dashboard-legacy'

function normalizedText(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

function isOverviewLabel(value: unknown) {
  const label = normalizedText(value)
  return label === '생산 개요' || label === '생산 대시보드'
}

function findOverviewTab(): HTMLButtonElement | null {
  return (
    Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) => isOverviewLabel(button.textContent)) ?? null
  )
}

function overviewIsActive() {
  const tab = findOverviewTab()
  if (!tab) return false
  const className = String(tab.className ?? '')
  return className.includes('text-green-400') || className.includes('border-green-500')
}

function normalizeOverviewTabLabel() {
  const tab = findOverviewTab()
  if (tab && normalizedText(tab.textContent) === '생산 개요') tab.textContent = '생산 대시보드'
}

function findLegacyOverviewRoot(): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('div.space-y-5'))
  return (
    candidates.find((candidate) => {
      const value = normalizedText(candidate.textContent)
      return (
        value.includes('오늘 생산 제품') &&
        value.includes('총 생산 수량') &&
        value.includes('상태별 건수') &&
        value.includes('생산 실적 / 제조기록서')
      )
    }) ?? null
  )
}

export default function ProductionDashboardController() {
  const [host, setHost] = useState<HTMLElement | null>(null)

  useEffect(() => {
    let disposed = false
    let timer: number | null = null
    let legacyRoot: HTMLElement | null = null
    let currentHost: HTMLDivElement | null = null

    const clearMountedDashboard = () => {
      if (legacyRoot?.isConnected) {
        legacyRoot.style.removeProperty('display')
        legacyRoot.removeAttribute(LEGACY_ATTR)
      }
      if (currentHost?.isConnected) currentHost.remove()
      legacyRoot = null
      currentHost = null
      if (!disposed) setHost(null)
    }

    const sync = () => {
      if (disposed) return
      normalizeOverviewTabLabel()

      if (!overviewIsActive()) {
        if (legacyRoot || currentHost) clearMountedDashboard()
        return
      }

      const target = findLegacyOverviewRoot()
      if (!target) return

      if (target === legacyRoot && currentHost?.isConnected) return
      clearMountedDashboard()

      const nextHost = document.createElement('div')
      nextHost.setAttribute(HOST_ATTR, 'true')
      nextHost.className = 'w-full'
      target.setAttribute(LEGACY_ATTR, 'true')
      target.style.display = 'none'
      target.insertAdjacentElement('afterend', nextHost)

      legacyRoot = target
      currentHost = nextHost
      setHost(nextHost)
    }

    const schedule = () => {
      if (timer !== null) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        timer = null
        sync()
      }, 100)
    }

    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    window.addEventListener('focus', schedule)
    schedule()

    return () => {
      disposed = true
      observer.disconnect()
      window.removeEventListener('focus', schedule)
      if (timer !== null) window.clearTimeout(timer)
      if (legacyRoot?.isConnected) {
        legacyRoot.style.removeProperty('display')
        legacyRoot.removeAttribute(LEGACY_ATTR)
      }
      if (currentHost?.isConnected) currentHost.remove()
    }
  }, [])

  return host ? createPortal(<ProductionDashboardPanel />, host) : null
}
