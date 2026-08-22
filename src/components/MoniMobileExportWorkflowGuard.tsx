'use client'

import { useLayoutEffect } from 'react'
import { classifyMobileBusinessIntent } from '@/lib/moni/mobile-business-intents'

const EXPORT_ACK_PREFIX = '앞 대화에서 이미 제공한 품목·수량·수출정보를 자동으로 불러와'
const GENERIC_CARD_HOST = '[data-moni-business-card-host="true"]'
const EXPORT_DRAFT_READY = '.moni-sales-export-bundle-host .moni-export-card .moni-export-actions'

function requestPath(input: RequestInfo | URL) {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  try { return new URL(raw, window.location.href).pathname } catch { return raw }
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit) {
  return String(init?.method || (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')).toUpperCase()
}

function requestMessage(input: RequestInfo | URL, init?: RequestInit) {
  if (requestMethod(input, init) !== 'POST' || requestPath(input) !== '/api/moni/mobile-action-start' || typeof init?.body !== 'string') return ''
  try {
    const parsed = JSON.parse(init.body) as { message?: unknown }
    return String(parsed.message || '').trim()
  } catch {
    return ''
  }
}

function elapsedText(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remain = seconds % 60
  return `${minutes}분 ${String(remain).padStart(2, '0')}초`
}

function phaseText(seconds: number) {
  if (seconds < 5) return '앞 대화에서 품목·수량·수출정보를 읽고 있습니다.'
  if (seconds < 12) return '등록된 수출처와 공식 수출품목을 대조하고 있습니다.'
  if (seconds < 20) return '포장단위와 CTN 수량을 계산하고 있습니다.'
  return '자동 입력값과 확인이 필요한 항목을 최종 정리하고 있습니다.'
}

function thinkingStage(seconds: number) {
  if (seconds >= 90) return 'apology'
  if (seconds >= 60) return 'detail-2'
  if (seconds >= 30) return 'detail-1'
  if (seconds >= 15) return 'grace'
  return 'normal'
}

function setHeaderThinking(root: HTMLElement, thinking: boolean) {
  const liveState = root.querySelector<HTMLElement>('.moni-live-state')
  const character = root.querySelector<HTMLElement>('.moni-mobile-character')

  if (thinking) {
    root.dataset.moniExportWorkflowThinking = 'true'
    if (liveState) {
      liveState.classList.remove('moni-live-state-live', 'moni-live-state-issue', 'moni-live-state-listening')
      liveState.classList.add('moni-live-state-thinking')
      const label = liveState.querySelector<HTMLElement>('span:last-child')
      if (label) label.textContent = 'THINKING'
    }
    if (character) {
      character.classList.remove('moni-mobile-character-live', 'moni-mobile-character-issue', 'moni-mobile-character-listening')
      character.classList.add('moni-mobile-character-thinking')
    }
    return
  }

  if (root.dataset.moniExportWorkflowThinking !== 'true') return
  delete root.dataset.moniExportWorkflowThinking
  delete root.dataset.moniThinkingStage
  if (liveState?.classList.contains('moni-live-state-thinking')) {
    liveState.classList.remove('moni-live-state-thinking')
    liveState.classList.add('moni-live-state-live')
    const label = liveState.querySelector<HTMLElement>('span:last-child')
    if (label) label.textContent = 'LIVE'
  }
  if (character?.classList.contains('moni-mobile-character-thinking')) {
    character.classList.remove('moni-mobile-character-thinking')
    character.classList.add('moni-mobile-character-live')
  }
}

function hideGenericCard(root: HTMLElement, hide: boolean) {
  const host = root.querySelector<HTMLElement>(GENERIC_CARD_HOST)
  if (host) host.style.display = hide ? 'none' : ''
}

function hideExportAck(root: HTMLElement, hide: boolean) {
  root.querySelectorAll<HTMLElement>('.moni-markdown').forEach((markdown) => {
    const content = String(markdown.textContent || '').trim()
    if (!content.startsWith(EXPORT_ACK_PREFIX)) return
    const bubble = markdown.closest<HTMLElement>('.mr-2')
    if (bubble) bubble.style.display = hide ? 'none' : ''
  })
}

export default function MoniMobileExportWorkflowGuard() {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-moni-mobile-chat]')
    if (!root) return
    const chatRoot = root

    const originalFetch = window.fetch.bind(window)
    let exportTurn = false
    let exportWaiting = false
    let startedAt = 0
    let progressNode: HTMLDivElement | null = null

    function removeProgress() {
      progressNode?.remove()
      progressNode = null
    }

    function ensureProgress() {
      const scroller = chatRoot.querySelector<HTMLElement>('header + div')
      if (!scroller) return
      if (!progressNode) {
        progressNode = document.createElement('div')
        progressNode.dataset.moniExportWorkflowProgress = 'true'
        progressNode.className = 'moni-export-thinking-host'
        progressNode.style.cssText = 'box-sizing:border-box;width:100%;max-width:100%;padding:8px 14px 12px;pointer-events:none;'
        scroller.appendChild(progressNode)
      }

      const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
      chatRoot.dataset.moniThinkingStage = thinkingStage(seconds)
      progressNode.innerHTML = `
        <div class="moni-export-thinking-indicator moni-live-state-thinking" role="status" aria-live="polite" style="box-sizing:border-box;width:100%;max-width:720px;margin:0 auto;border:1px solid #d8e8e4;border-radius:18px;background:#fff;padding:13px 14px;color:#607d8d;box-shadow:0 5px 18px rgba(23,59,82,.05)">
          <div class="moni-export-thinking-head" style="display:flex;align-items:center;justify-content:space-between;gap:10px;color:#456b79;font-size:12px">
            <b>MONI가 수출 문서 입력값을 준비 중</b>
            <span style="letter-spacing:3px;color:#3584e4;font-weight:900;animation:moniExportThinkingDots 1.1s ease-in-out infinite">•••</span>
          </div>
          <div class="moni-export-thinking-time" style="margin-top:5px;color:#bd3d3d;font-size:12px;font-weight:900">경과 시간 · ${elapsedText(seconds)}</div>
          <div class="moni-export-thinking-phase" style="margin-top:3px;color:#78909a;font-size:11px;line-height:1.55">${phaseText(seconds)}</div>
          <style>@keyframes moniExportThinkingDots{0%,100%{opacity:.35}50%{opacity:1}}</style>
        </div>`
    }

    function startExportTurn() {
      exportTurn = true
      exportWaiting = true
      startedAt = Date.now()
      hideGenericCard(chatRoot, true)
      hideExportAck(chatRoot, true)
      setHeaderThinking(chatRoot, true)
      ensureProgress()
    }

    function finishWaiting() {
      exportWaiting = false
      setHeaderThinking(chatRoot, false)
      removeProgress()
      hideGenericCard(chatRoot, true)
      hideExportAck(chatRoot, true)
    }

    function endExportTurn() {
      exportTurn = false
      exportWaiting = false
      setHeaderThinking(chatRoot, false)
      removeProgress()
      hideGenericCard(chatRoot, false)
      hideExportAck(chatRoot, false)
    }

    const wrappedFetch: typeof window.fetch = async (input, init) => {
      const message = requestMessage(input, init)
      if (message) {
        const intent = classifyMobileBusinessIntent(message)
        if (intent?.domain === 'sales_export_bundle') startExportTurn()
        else endExportTurn()
      }
      return originalFetch(input, init)
    }
    window.fetch = wrappedFetch

    const onUserTurnStart = (event: Event) => {
      const detail = (event as CustomEvent<{ structured?: boolean }>).detail || {}
      if (!detail.structured) endExportTurn()
    }
    window.addEventListener('moni:user-turn-start', onUserTurnStart)

    const timer = window.setInterval(() => {
      if (!exportTurn) return
      hideGenericCard(chatRoot, true)
      hideExportAck(chatRoot, true)
      const draftReady = Boolean(chatRoot.querySelector(EXPORT_DRAFT_READY))
      if (draftReady) {
        if (exportWaiting) finishWaiting()
        return
      }
      if (exportWaiting) {
        setHeaderThinking(chatRoot, true)
        ensureProgress()
      }
    }, 220)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('moni:user-turn-start', onUserTurnStart)
      if (window.fetch === wrappedFetch) window.fetch = originalFetch
      setHeaderThinking(chatRoot, false)
      removeProgress()
      hideGenericCard(chatRoot, false)
      hideExportAck(chatRoot, false)
    }
  }, [])

  return null
}
