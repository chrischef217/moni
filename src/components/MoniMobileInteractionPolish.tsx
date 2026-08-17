'use client'

import { useLayoutEffect } from 'react'
import {
  MONI_ETA_DEFAULTS,
  classifyMoniEtaKind,
  fallbackProgressText,
  robustEtaEstimate,
  thinkingStage,
  type MoniEtaKind,
  type MoniThinkingStage,
} from '@/lib/moni/mobile-eta'

const MESSAGE_CACHE_KEY = 'moni-mobile-message-cache-v1'
const ADAPTIVE_ETA_KEY = 'moni-mobile-adaptive-eta-v2'
const LEGACY_DEMO_PATTERN = /핸드워시\s*레몬/i
const THINKING_SELECTOR = '.moni-live-state-thinking'
const STATUS_REFRESH_MS = 1500

type CachedMessage = {
  role?: unknown
  content?: unknown
  [key: string]: unknown
}

type LocalEtaProfile = {
  estimate?: number
  samples?: number
  history?: number[]
}

function stripLegacyDemoLine(value: unknown) {
  const content = String(value ?? '')
  if (!LEGACY_DEMO_PATTERN.test(content)) return content
  return content
    .split('\n')
    .filter((line) => !LEGACY_DEMO_PATTERN.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function scrubLegacyDemoCache() {
  try {
    const raw = window.localStorage.getItem(MESSAGE_CACHE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return

    let changed = false
    const cleaned = parsed.map((item: CachedMessage) => {
      if (!item || typeof item !== 'object') return item
      const nextContent = stripLegacyDemoLine(item.content)
      if (nextContent === String(item.content ?? '')) return item
      changed = true
      return { ...item, content: nextContent }
    }).filter((item: CachedMessage) => String(item?.content ?? '').trim())

    if (changed) window.localStorage.setItem(MESSAGE_CACHE_KEY, JSON.stringify(cleaned))
  } catch {
    // Cache cleanup is best-effort and must never block MONI rendering.
  }
}

function readEtaProfiles() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ADAPTIVE_ETA_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed as Record<string, LocalEtaProfile> : {}
  } catch {
    return {}
  }
}

function localEstimate(kind: MoniEtaKind) {
  const profile = readEtaProfiles()[kind]
  const value = Number(profile?.estimate)
  return Number.isFinite(value) && value >= 5 && value <= 60 ? Math.round(value) : MONI_ETA_DEFAULTS[kind]
}

function rememberLocalDuration(kind: MoniEtaKind, actualSeconds: number) {
  if (!Number.isFinite(actualSeconds) || actualSeconds < 2 || actualSeconds > 120) return
  try {
    const profiles = readEtaProfiles()
    const profile = profiles[kind] || {}
    const previous = Number(profile.estimate) || MONI_ETA_DEFAULTS[kind]
    const history = [...(Array.isArray(profile.history) ? profile.history : []), Math.round(actualSeconds)].slice(-10)
    const target = robustEtaEstimate([...history].reverse(), MONI_ETA_DEFAULTS[kind])
    const predictionError = Math.abs(actualSeconds - previous)
    const learningRate = predictionError > 10 ? 0.72 : 0.46
    const estimate = Math.max(5, Math.min(60, Math.round(previous * (1 - learningRate) + target * learningRate)))
    profiles[kind] = {
      estimate,
      samples: Math.min(999, Number(profile.samples || 0) + 1),
      history,
    }
    window.localStorage.setItem(ADAPTIVE_ETA_KEY, JSON.stringify(profiles))
  } catch {
    // ETA learning is UX-only and must never block the business request.
  }
}

function parseAgentRequest(input: RequestInfo | URL, init?: RequestInit) {
  const method = String(init?.method || (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')).toUpperCase()
  if (method !== 'POST') return null
  const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  let pathname = rawUrl
  try { pathname = new URL(rawUrl, window.location.href).pathname } catch { /* keep raw URL */ }
  if (pathname !== '/api/moni/agent-runtime' || typeof init?.body !== 'string') return null
  try {
    const body = JSON.parse(init.body) as { message?: unknown; thread_id?: unknown; attachment_ids?: unknown[] }
    return {
      question: String(body.message || '').trim() || (Array.isArray(body.attachment_ids) && body.attachment_ids.length ? '첨부한 사진을 확인해줘.' : ''),
      threadId: String(body.thread_id || '').trim(),
    }
  } catch {
    return null
  }
}

function progressCopy(stage: MoniThinkingStage, elapsedSeconds: number, estimateSeconds: number, kind: MoniEtaKind, liveProgress: string) {
  const overtime = Math.max(0, Math.floor(elapsedSeconds - estimateSeconds))
  const remaining = Math.max(0, Math.ceil(estimateSeconds - elapsedSeconds))

  if (stage === 'normal') {
    return {
      main: `예상 대기 시간 · 약 ${remaining}초 남음`,
      detail: liveProgress || fallbackProgressText(kind, stage),
    }
  }
  if (stage === 'grace') {
    return {
      main: `예상 시간 초과 · ${overtime}초 추가`,
      detail: liveProgress || fallbackProgressText(kind, stage),
    }
  }
  if (stage === 'detail-1') {
    return {
      main: `예상보다 ${overtime}초 더 걸리고 있습니다.`,
      detail: liveProgress || fallbackProgressText(kind, stage),
    }
  }
  if (stage === 'detail-2') {
    return {
      main: `추가 확인이 길어지고 있습니다 · +${overtime}초`,
      detail: liveProgress || fallbackProgressText(kind, stage),
    }
  }
  return {
    main: `예상보다 오래 걸리고 있습니다 · +${overtime}초`,
    detail: liveProgress || fallbackProgressText(kind, stage),
  }
}

export default function MoniMobileInteractionPolish() {
  useLayoutEffect(() => {
    scrubLegacyDemoCache()

    const root = document.querySelector<HTMLElement>('[data-moni-mobile-chat]')
    if (!root) return
    const chatRoot = root
    const originalFetch = window.fetch.bind(window)

    let thinkingUiTimer: number | null = null
    let activeStartedAt = 0
    let activeEstimateSeconds = MONI_ETA_DEFAULTS.general
    let activeKind: MoniEtaKind = 'general'
    let activeThreadId = ''
    let activeProgress = ''
    let activeRequestSerial = 0
    let lastStatusRefreshAt = 0
    let statusRefreshInFlight = false

    function getThinkingPanel() {
      return Array.from(chatRoot.querySelectorAll<HTMLElement>('div[role="status"]'))
        .find((node) => (node.textContent || '').includes('MONI가 확인 중')) || null
    }

    async function refreshRuntimeProgress() {
      if (!activeThreadId || statusRefreshInFlight) return
      const now = Date.now()
      if (now - lastStatusRefreshAt < STATUS_REFRESH_MS) return
      lastStatusRefreshAt = now
      statusRefreshInFlight = true
      try {
        const response = await originalFetch(`/api/moni/agent-status?thread_id=${encodeURIComponent(activeThreadId)}&_=${now}`, { cache: 'no-store' })
        const payload = await response.json() as { ok?: boolean; progress?: string | null }
        if (response.ok && payload.ok && payload.progress) activeProgress = String(payload.progress)
      } catch {
        // Runtime progress is supplemental. Fallback copy remains truthful and available.
      } finally {
        statusRefreshInFlight = false
      }
    }

    function tickThinkingUi() {
      if (!chatRoot.querySelector(THINKING_SELECTOR)) return
      if (!activeStartedAt) activeStartedAt = Date.now()
      const elapsedSeconds = Math.max(0, (Date.now() - activeStartedAt) / 1000)
      const stage = thinkingStage(elapsedSeconds, activeEstimateSeconds)
      chatRoot.dataset.moniThinkingStage = stage

      const panel = getThinkingPanel()
      if (panel) {
        const copy = progressCopy(stage, elapsedSeconds, activeEstimateSeconds, activeKind, activeProgress)
        panel.dataset.moniAdaptiveProgress = 'true'
        panel.dataset.moniThinkingStage = stage
        panel.dataset.moniProgressMain = copy.main
        panel.dataset.moniProgressDetail = copy.detail
      }

      // Safe runtime execution state is useful from the first second, not only after ETA misses.
      void refreshRuntimeProgress()
    }

    function stopThinkingUi() {
      if (thinkingUiTimer !== null) {
        window.clearInterval(thinkingUiTimer)
        thinkingUiTimer = null
      }
      delete chatRoot.dataset.moniThinkingStage
    }

    function startThinkingUi() {
      if (thinkingUiTimer === null) thinkingUiTimer = window.setInterval(tickThinkingUi, 500)
      tickThinkingUi()
    }

    function syncThinkingState() {
      if (chatRoot.querySelector(THINKING_SELECTOR)) startThinkingUi()
      else stopThinkingUi()
    }

    async function refreshLearnedEstimate(kind: MoniEtaKind, serial: number) {
      try {
        const response = await originalFetch(`/api/moni/agent-eta?kind=${encodeURIComponent(kind)}&_=${Date.now()}`, { cache: 'no-store' })
        const payload = await response.json() as { ok?: boolean; estimate_seconds?: number; sample_count?: number }
        if (!response.ok || !payload.ok || serial !== activeRequestSerial) return
        const central = Number(payload.estimate_seconds)
        const centralSamples = Number(payload.sample_count || 0)
        if (!Number.isFinite(central) || central < 5 || central > 60) return
        const local = localEstimate(kind)
        activeEstimateSeconds = centralSamples >= 3
          ? Math.max(5, Math.min(60, Math.round(central * 0.72 + local * 0.28)))
          : local
        tickThinkingUi()
      } catch {
        // Keep the local/default estimate when central learning is unavailable.
      }
    }

    const wrappedFetch: typeof window.fetch = async (input, init) => {
      const details = parseAgentRequest(input, init)
      if (!details) return originalFetch(input, init)

      const serial = ++activeRequestSerial
      activeKind = classifyMoniEtaKind(details.question)
      activeEstimateSeconds = localEstimate(activeKind)
      activeStartedAt = Date.now()
      activeThreadId = details.threadId || window.localStorage.getItem('moni-global-agent-thread-v11') || ''
      activeProgress = ''
      lastStatusRefreshAt = 0
      void refreshLearnedEstimate(activeKind, serial)

      try {
        const response = await originalFetch(input, init)
        const actualSeconds = (Date.now() - activeStartedAt) / 1000
        if (serial === activeRequestSerial && response.ok) rememberLocalDuration(activeKind, actualSeconds)
        return response
      } catch (error) {
        throw error
      }
    }
    window.fetch = wrappedFetch

    const observer = new MutationObserver(syncThinkingState)
    observer.observe(chatRoot, {
      attributes: true,
      attributeFilter: ['class'],
      childList: true,
      subtree: true,
    })
    syncThinkingState()

    return () => {
      observer.disconnect()
      stopThinkingUi()
      window.fetch = originalFetch
    }
  }, [])

  return (
    <style jsx global>{`
      [data-moni-mobile-chat] {
        overscroll-behavior: none;
      }

      [data-moni-mobile-chat] header {
        position: sticky !important;
        top: 0 !important;
        z-index: 180 !important;
        flex: 0 0 auto !important;
        transform: translate3d(0, 0, 0);
        backface-visibility: hidden;
        will-change: transform;
        background: rgba(255, 255, 255, .985) !important;
        box-shadow: 0 1px 0 rgba(120, 153, 166, .10);
      }

      [data-moni-mobile-chat] header + div {
        overscroll-behavior-y: contain;
        overscroll-behavior-x: none;
        overflow-x: hidden;
      }

      [data-moni-mobile-chat] button[aria-label="전송"] {
        border: 1px solid #cbd8dd !important;
        background: #dce6ea !important;
        color: #173b52 !important;
        box-shadow: 0 3px 10px rgba(23, 59, 82, .08) !important;
      }

      [data-moni-mobile-chat] button[aria-label="전송"]:disabled {
        border-color: #dce3e5 !important;
        background: #e8ecee !important;
        color: #a6b0b5 !important;
        box-shadow: none !important;
        opacity: 1 !important;
      }
    `}</style>
  )
}
