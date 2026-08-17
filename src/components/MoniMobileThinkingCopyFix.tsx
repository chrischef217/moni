'use client'

import { useLayoutEffect } from 'react'

type ThinkingStage = 'normal' | 'grace' | 'detail-1' | 'detail-2' | 'apology'

type RuntimeStatusPayload = {
  ok?: boolean
  progress?: string | null
  progress_detail?: string | null
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
  if (stage === 'normal') return cleanedDetail || '질문의 범위와 필요한 데이터를 확인하고 있습니다.'
  if (stage === 'grace') return cleanedDetail || '예상 시간을 넘어 실제 실행 상태를 다시 확인하고 있습니다.'
  return cleanedDetail || '실제 실행 상태를 확인하면서 다음 단계를 진행하고 있습니다.'
}

export default function MoniMobileThinkingCopyFix() {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-moni-mobile-chat]')
    if (!root) return
    const chatRoot = root

    let liveProgress = ''
    let liveProgressDetail = ''
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
      const metaLine = document.createElement('div')
      metaLine.dataset.moniProgressMetaLine = 'true'
      lines.append(mainLine, detailLine, metaLine)

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
      const metaLine = lines.querySelector<HTMLElement>('[data-moni-progress-meta-line]')

      const stage = String(panel.dataset.moniThinkingStage || chatRoot.dataset.moniThinkingStage || '') as ThinkingStage | ''
      const main = String(panel.dataset.moniProgressMain || '').trim()
        || originalEta
        || '예상 대기 시간을 계산하고 있습니다.'
      const adaptiveDetail = stripDuplicateElapsedTime(String(panel.dataset.moniProgressDetail || '').trim())
      const detail = stripDuplicateElapsedTime(liveProgress) || visibleDetail(stage, adaptiveDetail)
      const meta = stripDuplicateElapsedTime(liveProgressDetail) || (stage === 'normal'
        ? '실제 실행 기록을 약 1초 간격으로 확인해 현재 단계를 갱신합니다.'
        : '예상 시간을 넘긴 뒤에도 실제 실행 기록 기준으로 현재 위치를 계속 표시합니다.')

      const detailText = detail ? `현재 진행 · ${detail}` : ''
      const metaText = meta ? `진행 현황 · ${meta}` : ''
      if (mainLine && mainLine.textContent !== main) mainLine.textContent = main
      if (detailLine && detailLine.textContent !== detailText) detailLine.textContent = detailText
      if (metaLine && metaLine.textContent !== metaText) metaLine.textContent = metaText
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
          liveProgressDetail = stripDuplicateElapsedTime(String(payload.progress_detail || '').trim())
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
        liveProgressDetail = ''
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
        min-height: 48px !important;
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

      [data-moni-mobile-chat] [data-moni-progress-meta-line="true"] {
        display: block !important;
        color: #8a9da6;
        font-size: 10px;
        font-weight: 650;
        line-height: 1.5;
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
    `}</style>
  )
}
