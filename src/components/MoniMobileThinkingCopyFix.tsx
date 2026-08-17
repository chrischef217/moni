'use client'

import { useLayoutEffect } from 'react'

type ThinkingStage = 'normal' | 'grace' | 'detail-1' | 'detail-2' | 'apology'

type RuntimeStatusPayload = {
  ok?: boolean
  progress?: string | null
  run_status?: string | null
  completed_tool_steps?: number
  current_tool_label?: string | null
  last_completed_tool_label?: string | null
  elapsed_seconds?: number
}

const STATUS_REFRESH_MS = 1200

function stripDuplicateElapsedTime(value: string) {
  return String(value || '')
    .replace(/^(?:처리|실행)\s*시작\s*후\s*\d+\s*초\s*(?:[·ㆍ:|-]\s*)?/i, '')
    .trim()
}

function visibleDetail(stage: ThinkingStage | '', rawDetail: string) {
  const cleanedDetail = stripDuplicateElapsedTime(rawDetail)
  if (stage === 'normal') return cleanedDetail || '질문에 필요한 대상·기간·데이터 범위를 확인하고 있습니다.'
  if (stage === 'grace') return cleanedDetail || '실제 실행 기록을 다시 확인하면서 다음 처리 단계를 이어가고 있습니다.'
  return cleanedDetail || '현재 실행 단계와 완료된 조회를 기준으로 답변을 계속 준비하고 있습니다.'
}

export default function MoniMobileThinkingCopyFix() {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-moni-mobile-chat]')
    if (!root) return
    const chatRoot = root

    let liveProgress = ''
    let statusTimer: number | null = null
    let statusRequestInFlight = false

    function thinkingPanels() {
      return Array.from(chatRoot.querySelectorAll<HTMLElement>('div[role="status"]'))
        .filter((node) => (node.textContent || '').includes('MONI가 확인 중'))
    }

    function ensureLines(panel: HTMLElement) {
      let lines = panel.querySelector<HTMLElement>(':scope > [data-moni-progress-lines]')
      if (lines) return lines

      lines = document.createElement('div')
      lines.dataset.moniProgressLines = 'true'

      const mainLine = document.createElement('div')
      mainLine.dataset.moniProgressMainLine = 'true'
      const detailLine = document.createElement('div')
      detailLine.dataset.moniProgressDetailLine = 'true'
      lines.append(mainLine, detailLine)

      const firstChild = panel.firstElementChild
      if (firstChild?.nextSibling) panel.insertBefore(lines, firstChild.nextSibling)
      else panel.appendChild(lines)
      return lines
    }

    function syncPanel(panel: HTMLElement) {
      const originalChildren = Array.from(panel.children)
        .filter((child) => !(child instanceof HTMLElement && child.dataset.moniProgressLines === 'true')) as HTMLElement[]
      const originalEta = String(originalChildren[1]?.textContent || '').trim()

      if (panel.dataset.moniAdaptiveProgress !== 'true') panel.dataset.moniAdaptiveProgress = 'true'
      const lines = ensureLines(panel)
      const mainLine = lines.querySelector<HTMLElement>('[data-moni-progress-main-line]')
      const detailLine = lines.querySelector<HTMLElement>('[data-moni-progress-detail-line]')

      const stage = String(panel.dataset.moniThinkingStage || chatRoot.dataset.moniThinkingStage || '') as ThinkingStage | ''
      const main = String(panel.dataset.moniProgressMain || '').trim()
        || originalEta
        || '예상 대기 시간을 계산하고 있습니다.'
      const adaptiveDetail = stripDuplicateElapsedTime(String(panel.dataset.moniProgressDetail || '').trim())
      const detail = stripDuplicateElapsedTime(liveProgress) || visibleDetail(stage, adaptiveDetail)

      const detailText = detail ? `현재 진행 · ${detail}` : ''
      if (mainLine && mainLine.textContent !== main) mainLine.textContent = main
      if (detailLine && detailLine.textContent !== detailText) detailLine.textContent = detailText
      lines.hidden = false
    }

    function syncAll() {
      thinkingPanels().forEach(syncPanel)
    }

    async function refreshRuntimeStatus() {
      if (statusRequestInFlight || thinkingPanels().length === 0) return
      const threadId = String(window.localStorage.getItem('moni-global-agent-thread-v11') || '').trim()
      if (!threadId) return

      statusRequestInFlight = true
      try {
        const response = await window.fetch(`/api/moni/agent-status?thread_id=${encodeURIComponent(threadId)}&_=${Date.now()}`, {
          cache: 'no-store',
        })
        const payload = await response.json() as RuntimeStatusPayload
        if (!response.ok || !payload.ok) return

        if (payload.run_status === 'RUNNING') {
          liveProgress = stripDuplicateElapsedTime(String(payload.progress || '').trim())
          syncAll()
        }
      } catch {
        // The card keeps its truthful local fallback when status polling is temporarily unavailable.
      } finally {
        statusRequestInFlight = false
      }
    }

    function syncPolling() {
      const active = thinkingPanels().length > 0
      if (active && statusTimer === null) {
        syncAll()
        void refreshRuntimeStatus()
        statusTimer = window.setInterval(() => void refreshRuntimeStatus(), STATUS_REFRESH_MS)
      } else if (!active && statusTimer !== null) {
        window.clearInterval(statusTimer)
        statusTimer = null
        liveProgress = ''
      }
      syncAll()
    }

    syncPolling()
    const observer = new MutationObserver(syncPolling)
    observer.observe(chatRoot, {
      attributes: true,
      attributeFilter: [
        'class',
        'data-moni-adaptive-progress',
        'data-moni-progress-main',
        'data-moni-progress-detail',
        'data-moni-thinking-stage',
      ],
      childList: true,
      subtree: true,
    })

    return () => {
      observer.disconnect()
      if (statusTimer !== null) window.clearInterval(statusTimer)
    }
  }, [])

  return (
    <style jsx global>{`
      [data-moni-mobile-chat] [data-moni-adaptive-progress="true"]::after {
        content: none !important;
        display: none !important;
      }

      /* Higher specificity than every legacy nth-child hiding rule. */
      [data-moni-mobile-chat] [data-moni-adaptive-progress="true"] > div[data-moni-progress-lines="true"]:not([data-never-match]) {
        display: grid !important;
        visibility: visible !important;
        opacity: 1 !important;
        height: auto !important;
        min-height: 36px !important;
        gap: 5px;
        margin-top: 7px;
      }

      [data-moni-mobile-chat] [data-moni-progress-lines="true"] ~ div {
        display: none !important;
      }

      [data-moni-mobile-chat] [data-moni-progress-main-line="true"] {
        display: block !important;
        color: #456b79;
        font-size: 11.5px;
        font-weight: 850;
        line-height: 1.45;
      }

      [data-moni-mobile-chat] [data-moni-progress-detail-line="true"] {
        display: block !important;
        color: #587b89;
        font-size: 10.8px;
        font-weight: 750;
        line-height: 1.55;
      }

      [data-moni-mobile-chat] [data-moni-progress-detail-line="true"]::after {
        content: '  •••';
        display: inline-block;
        min-width: 24px;
        letter-spacing: 1.8px;
        opacity: 0.36;
        animation: moni-progress-dots 1.15s ease-in-out infinite;
      }

      [data-moni-mobile-chat] [data-moni-thinking-stage="grace"] [data-moni-progress-main-line="true"],
      [data-moni-mobile-chat] [data-moni-thinking-stage="detail-1"] [data-moni-progress-main-line="true"],
      [data-moni-mobile-chat] [data-moni-thinking-stage="detail-2"] [data-moni-progress-main-line="true"],
      [data-moni-mobile-chat] [data-moni-thinking-stage="apology"] [data-moni-progress-main-line="true"] {
        color: #c2413b;
      }

      [data-moni-mobile-chat] [data-moni-thinking-stage="grace"] [data-moni-progress-detail-line="true"],
      [data-moni-mobile-chat] [data-moni-thinking-stage="detail-1"] [data-moni-progress-detail-line="true"],
      [data-moni-mobile-chat] [data-moni-thinking-stage="detail-2"] [data-moni-progress-detail-line="true"],
      [data-moni-mobile-chat] [data-moni-thinking-stage="apology"] [data-moni-progress-detail-line="true"] {
        color: #9f3f39;
      }

      @keyframes moni-progress-dots {
        0%, 100% { opacity: 0.28; transform: translateX(0); }
        50% { opacity: 0.9; transform: translateX(2px); }
      }

      @media (prefers-reduced-motion: reduce) {
        [data-moni-mobile-chat] [data-moni-progress-detail-line="true"]::after {
          animation: none;
          opacity: 0.6;
        }
      }
    `}</style>
  )
}
