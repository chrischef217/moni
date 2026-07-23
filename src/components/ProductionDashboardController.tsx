'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import ProductionDashboardPanel from '@/components/ProductionDashboardPanel'

const HOST_ATTR = 'data-production-dashboard-host'
const LEGACY_ATTR = 'data-production-dashboard-legacy'

function normalizedText(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

function hasLegacyOverviewContent(element: HTMLElement) {
  const value = normalizedText(element.textContent)
  return (
    value.includes('오늘 생산 제품') &&
    value.includes('총 생산 수량') &&
    value.includes('상태별 건수') &&
    value.includes('생산 실적 / 제조기록서')
  )
}

function findLegacyOverviewRoot(): HTMLElement | null {
  // AdminDashboard.renderOverviewContent()의 실제 최상위 구조를 우선 사용한다.
  const exactRoot = Array.from(document.querySelectorAll<HTMLElement>('div.space-y-5')).find(hasLegacyOverviewContent)
  if (exactRoot) return exactRoot

  // 클래스가 바뀌어도 제조기록서 제목에서 가장 가까운 공통 컨테이너를 찾아 교체한다.
  const recordHeading = Array.from(document.querySelectorAll<HTMLElement>('h1, h2, h3, h4')).find(
    (node) => normalizedText(node.textContent) === '생산 실적 / 제조기록서',
  )
  if (!recordHeading) return null

  let current: HTMLElement | null = recordHeading.parentElement
  while (current && current !== document.body) {
    if (hasLegacyOverviewContent(current)) return current
    if (current.tagName === 'MAIN') break
    current = current.parentElement
  }

  return null
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

      // 생산 개요의 실제 콘텐츠가 존재하는 것 자체가 현재 화면이 생산 대시보드라는 기준이다.
      // 전역 사이드바와 내부 탭의 선택 색상/클래스에는 의존하지 않는다.
      const target = findLegacyOverviewRoot()
      if (!target) {
        if (legacyRoot || currentHost) clearMountedDashboard()
        return
      }

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
      }, 60)
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
