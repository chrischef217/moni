'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { classifyMobileBusinessIntent } from '@/lib/moni/mobile-business-intents'

const BUNDLE_CARD_SELECTOR = '.moni-sales-export-bundle-host .moni-export-card'
const GENERIC_CARD_SELECTOR = '[data-moni-business-card-host="true"]'

function latestUserMessage(root: HTMLElement) {
  const scroller = root.querySelector<HTMLElement>('header + div')
  if (!scroller) return ''
  const rows = Array.from(scroller.querySelectorAll<HTMLElement>('.ml-10.whitespace-pre-wrap'))
  return String(rows.at(-1)?.textContent || '').trim()
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

export default function MoniMobileExportThinkingBridge() {
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [active, setActive] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const startedAtRef = useRef(0)
  const exportTurnRef = useRef(false)
  const activeRef = useRef(false)

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-moni-mobile-chat]')
    if (!root) return
    const scroller = root.querySelector<HTMLElement>('header + div')
    if (!scroller) return

    const node = document.createElement('div')
    node.dataset.moniExportThinkingHost = 'true'
    node.className = 'moni-export-thinking-host'
    scroller.appendChild(node)
    setHost(node)

    const hideGenericCard = (hide: boolean) => {
      const generic = root.querySelector<HTMLElement>(GENERIC_CARD_SELECTOR)
      if (generic) generic.style.display = hide ? 'none' : ''
    }

    const syncHeader = (thinking: boolean) => {
      const liveState = root.querySelector<HTMLElement>('.moni-live-state')
      const character = root.querySelector<HTMLElement>('.moni-mobile-character')
      if (thinking) {
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
      } else {
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
        delete root.dataset.moniThinkingStage
      }
    }

    const stopThinking = () => {
      if (!activeRef.current) return
      activeRef.current = false
      setActive(false)
      syncHeader(false)
    }

    const cardReady = () => Boolean(root.querySelector(BUNDLE_CARD_SELECTOR))

    const beginExportThinking = () => {
      exportTurnRef.current = true
      hideGenericCard(true)
      startedAtRef.current = Date.now()
      setSeconds(0)
      activeRef.current = true
      setActive(true)
      root.dataset.moniThinkingStage = 'normal'
      syncHeader(true)
      window.setTimeout(() => {
        if (activeRef.current && cardReady()) stopThinking()
      }, 500)
    }

    const classifyLatestTurn = () => {
      const message = latestUserMessage(root)
      const intent = classifyMobileBusinessIntent(message)
      if (intent?.domain === 'sales_export_bundle') {
        exportTurnRef.current = true
        hideGenericCard(true)
        if (cardReady()) stopThinking()
        else if (!activeRef.current) beginExportThinking()
        return true
      }
      exportTurnRef.current = false
      hideGenericCard(false)
      stopThinking()
      return false
    }

    const onUserTurnStart = () => {
      exportTurnRef.current = false
      hideGenericCard(false)
      stopThinking()
      for (const delay of [40, 120, 260]) window.setTimeout(() => classifyLatestTurn(), delay)
    }

    window.addEventListener('moni:user-turn-start', onUserTurnStart)

    const observer = new MutationObserver(() => {
      if (exportTurnRef.current) hideGenericCard(true)
      if (activeRef.current) {
        syncHeader(true)
        if (Date.now() - startedAtRef.current >= 400 && cardReady()) stopThinking()
      }
    })
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })

    const progressTimer = window.setInterval(() => {
      if (!activeRef.current) return
      const elapsed = Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000))
      setSeconds(elapsed)
      root.dataset.moniThinkingStage = thinkingStage(elapsed)
      syncHeader(true)
      hideGenericCard(true)
      if (cardReady() && elapsed > 0) stopThinking()
    }, 1000)

    window.setTimeout(() => classifyLatestTurn(), 350)

    return () => {
      observer.disconnect()
      window.clearInterval(progressTimer)
      window.removeEventListener('moni:user-turn-start', onUserTurnStart)
      hideGenericCard(false)
      syncHeader(false)
      node.remove()
    }
  }, [])

  if (!host || !active) return null

  return createPortal(
    <div className="moni-export-thinking-indicator moni-live-state-thinking" role="status" aria-live="polite">
      <div className="moni-export-thinking-head">
        <b>MONI가 수출 문서 입력값을 준비 중</b>
        <span>•••</span>
      </div>
      <div className="moni-export-thinking-time">경과 시간 · {elapsedText(seconds)}</div>
      <div className="moni-export-thinking-phase">{phaseText(seconds)}</div>
      <style>{`
        .moni-export-thinking-host{box-sizing:border-box;width:100%;max-width:100%;padding:8px 14px 12px}
        .moni-export-thinking-indicator{box-sizing:border-box;width:100%;max-width:720px;margin:0 auto;border:1px solid #d8e8e4;border-radius:18px;background:#fff;padding:13px 14px;color:#607d8d;box-shadow:0 5px 18px rgba(23,59,82,.05)}
        .moni-export-thinking-head{display:flex;align-items:center;justify-content:space-between;gap:10px;color:#456b79;font-size:12px}.moni-export-thinking-head span{letter-spacing:3px;color:#3584e4;font-weight:900;animation:moniExportThinkingDots 1.1s ease-in-out infinite}
        .moni-export-thinking-time{margin-top:5px;color:#bd3d3d;font-size:12px;font-weight:900}.moni-export-thinking-phase{margin-top:3px;color:#78909a;font-size:11px;line-height:1.55}
        @keyframes moniExportThinkingDots{0%,100%{opacity:.35}50%{opacity:1}}
      `}</style>
    </div>,
    host,
  )
}
