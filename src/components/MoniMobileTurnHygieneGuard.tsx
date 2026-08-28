'use client'

import { useLayoutEffect } from 'react'

const MESSAGE_CACHE_KEY = 'moni-mobile-message-cache-v1'
const USER_TURN_START_EVENT = 'moni:user-turn-start'
const ANSWER_ENDPOINTS = new Set([
  '/api/moni/agent-runtime',
  '/api/moni/mobile-action-start',
])

function requestPath(input: RequestInfo | URL) {
  const raw = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url
  try {
    return new URL(raw, window.location.href).pathname
  } catch {
    return raw.split('?')[0]
  }
}

function plainText(value: string) {
  return String(value || '')
    .replace(/^\s*(?:[-*•>]\s*)+/gm, '')
    .replace(/[*_`#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isInternalProvenance(value: string) {
  const plain = plainText(value)
  if (!plain) return false

  // End users need the business answer, not MONI's implementation/provenance notes.
  if (/^(?:데이터\s*참고|내부\s*참고|시스템\s*참고|기술\s*참고|구현\s*참고)\s*[:：]/i.test(plain)) return true
  if (/^(?:source|provider|model|state_mode|agent[_ -]?runtime)\s*[:：=]/i.test(plain)) return true

  const technical = /(?:canonical|legacy|레거시|fallback|prefetch|SSOT|Supabase|\bRPC\b|raw_material|sales_product|OpenAI\s+Conversations|기준단가\s*마스터|원재료\s*마스터|제품\s*마스터)/i.test(plain)
  if (!technical) return false

  return /(?:마스터|원장|테이블|기준단가|사용\s*이력|동일\s*코드|fallback|prefetch|SSOT|Supabase|\bRPC\b|raw_material|sales_product|agent[_ -]?runtime)/i.test(plain)
}

function sanitizeAssistantText(value: unknown) {
  const source = String(value ?? '')
  if (!source.trim()) return source

  const paragraphs = source.split(/\n{2,}/)
  const cleaned = paragraphs
    .map((paragraph) => {
      if (isInternalProvenance(paragraph)) return ''
      return paragraph
        .split('\n')
        .filter((line) => !isInternalProvenance(line))
        .join('\n')
        .trim()
    })
    .filter(Boolean)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return cleaned || source
}

function scrubCachedAnswers() {
  try {
    const raw = window.localStorage.getItem(MESSAGE_CACHE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return

    let changed = false
    const cleaned = parsed.map((item) => {
      if (!item || typeof item !== 'object' || item.role !== 'assistant') return item
      const current = String(item.content ?? '')
      const next = sanitizeAssistantText(current)
      if (next === current) return item
      changed = true
      return { ...item, content: next }
    })

    if (changed) window.localStorage.setItem(MESSAGE_CACHE_KEY, JSON.stringify(cleaned))
  } catch {
    // Cache cleanup is display hygiene only and must never block MONI.
  }
}

async function sanitizeAnswerResponse(response: Response) {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase()
  if (!contentType.includes('application/json')) return response

  try {
    const payload = await response.clone().json() as {
      text?: unknown
      messages?: Array<Record<string, unknown>>
      [key: string]: unknown
    }
    let changed = false

    if (typeof payload.text === 'string') {
      const next = sanitizeAssistantText(payload.text)
      if (next !== payload.text) {
        payload.text = next
        changed = true
      }
    }

    if (Array.isArray(payload.messages)) {
      payload.messages = payload.messages.map((message) => {
        if (message?.role !== 'assistant' || typeof message.content !== 'string') return message
        const next = sanitizeAssistantText(message.content)
        if (next === message.content) return message
        changed = true
        return { ...message, content: next }
      })
    }

    if (!changed) return response
    const headers = new Headers(response.headers)
    headers.delete('content-length')
    return new Response(JSON.stringify(payload), {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  } catch {
    return response
  }
}

function resetTurnPresentation(root: HTMLElement) {
  // A new question always starts at the calm/normal stage, never at the previous turn's overtime stage.
  root.dataset.moniTurnResetPending = 'true'
  root.dataset.moniThinkingStage = 'normal'
  root.dataset.moniHeartbeatStage = 'normal'
  root.dataset.moniHeartbeatOvertime = 'false'
  root.style.setProperty('--moni-heartbeat-ms', '1320ms')

  root.querySelectorAll<HTMLElement>('div[role="status"]').forEach((panel) => {
    if (!(panel.textContent || '').includes('MONI가 확인 중')) return
    panel.dataset.moniThinkingStage = 'normal'
    delete panel.dataset.moniProgressMain
    delete panel.dataset.moniProgressDetail
  })

  const character = root.querySelector<HTMLElement>('.moni-mobile-character')
  if (character) {
    character.dataset.moniCharacterStage = 'normal'
    character.classList.remove('moni-thinking-spin')
    character.style.removeProperty('--moni-hop-x')
    character.style.removeProperty('--moni-hop-y')
    character.style.removeProperty('--moni-hop-r')
    character.style.removeProperty('--moni-hop-scale')
  }
}

function releaseResetGateWhenFresh(root: HTMLElement) {
  if (root.dataset.moniTurnResetPending !== 'true') return
  const panel = Array.from(root.querySelectorAll<HTMLElement>('div[role="status"]'))
    .find((node) => (node.textContent || '').includes('MONI가 확인 중'))
  if (!panel) return

  const main = String(panel.dataset.moniProgressMain || '').trim()
  const stage = String(panel.dataset.moniThinkingStage || root.dataset.moniThinkingStage || '')
  if (main && stage === 'normal') delete root.dataset.moniTurnResetPending
}

export default function MoniMobileTurnHygieneGuard() {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-moni-mobile-chat]')
    if (!root) return

    scrubCachedAnswers()

    const originalFetch = window.fetch.bind(window)
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const pathname = requestPath(input)
      const response = await originalFetch(input, init)
      if (!ANSWER_ENDPOINTS.has(pathname)) return response
      return sanitizeAnswerResponse(response)
    }) as typeof window.fetch

    let resetFallbackTimer: number | null = null
    const onUserTurnStart = () => {
      if (resetFallbackTimer !== null) window.clearTimeout(resetFallbackTimer)
      resetTurnPresentation(root)
      resetFallbackTimer = window.setTimeout(() => {
        resetFallbackTimer = null
        if (!root.querySelector('.moni-live-state-thinking')) delete root.dataset.moniTurnResetPending
      }, 1500)
    }
    window.addEventListener(USER_TURN_START_EVENT, onUserTurnStart)

    const observer = new MutationObserver(() => releaseResetGateWhenFresh(root))
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['data-moni-progress-main', 'data-moni-thinking-stage'],
      childList: true,
      subtree: true,
    })

    return () => {
      observer.disconnect()
      if (resetFallbackTimer !== null) window.clearTimeout(resetFallbackTimer)
      window.removeEventListener(USER_TURN_START_EVENT, onUserTurnStart)
      window.fetch = originalFetch as typeof window.fetch
    }
  }, [])

  return (
    <style jsx global>{`
      /* Never flash the previous turn's raw ETA/overtime text while the adaptive card initializes. */
      [data-moni-mobile-chat] div[role="status"]:has(.moni-thinking-dot) > div:not(:first-child):not([data-moni-progress-lines="true"]) {
        display: none !important;
      }

      [data-moni-mobile-chat][data-moni-turn-reset-pending="true"] [data-moni-progress-lines="true"] {
        visibility: hidden !important;
      }
    `}</style>
  )
}
