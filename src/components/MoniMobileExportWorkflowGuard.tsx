'use client'

import { useLayoutEffect } from 'react'
import { classifyMobileBusinessIntent } from '@/lib/moni/mobile-business-intents'

const EXPORT_ACK_PREFIX = '앞 대화에서 이미 제공한 품목·수량·수출정보를 자동으로 불러와'
const GENERIC_CARD_HOST = '[data-moni-business-card-host="true"]'
const EXPORT_CARD = '.moni-sales-export-bundle-host .moni-export-card'

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

function setHeaderThinking(root: HTMLElement, thinking: boolean) {
  const liveState = root.querySelector<HTMLElement>('.moni-live-state')
  const character = root.querySelector<HTMLElement>('.moni-mobile-character')

  if (thinking) {
    root.dataset.moniExportWorkflowThinking = 'true'
    root.dataset.moniThinkingStage = root.dataset.moniThinkingStage || 'normal'
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
        progressNode.style.cssText = 'box-sizing:border-box;width:100%;padding:8px 14px 12px;pointer-events:none;'
        scroller.appendChild(progressNode)
      }
      const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
      const phase = seconds < 3
        ? '대화에서 수출처·품목·수량을 읽고 있습니다.'
        : seconds < 7
          ? '공식 수출 마스터와 가장 가까운 값을 추천하고 있습니다.'
          : '포장단위와 CTN 수량을 계산하고 있습니다.'
      progressNode.innerHTML = `<div style="box-sizing:border-box;max-width:720px;margin:0 auto;border:1px solid #d8e8e4;border-radius:18px;background:#fff;padding:13px 14px;color:#607d8d;box-shadow:0 5px 18px rgba(23,59,82,.05)"><div style="display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px"><b style="color:#456b79">MONI가 수출 문서를 자동완성 중</b><span style="letter-spacing:3px;color:#e55757;font-weight:900">♥ ♥</span></div><div style="margin-top:5px;color:#bd3d3d;font-size:12px;font-weight:900">두근두근 · ${seconds}초</div><div style="margin-top:3px;color:#78909a;font-size:11px;line-height:1.55">${phase}</div></div>`
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
      const cardReady = Boolean(chatRoot.querySelector(EXPORT_CARD))
      if (cardReady) {
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
