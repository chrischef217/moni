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
}

const STATUS_REFRESH_MS = 1800

function visibleDetail(stage: ThinkingStage | '', rawDetail: string) {
  if (stage === 'normal') return rawDetail || '질문의 범위와 필요한 데이터를 확인하고 있습니다.'
  if (stage === 'grace') return rawDetail || '확인된 내용을 정리하고 답변을 마무리하고 있습니다.'
  return rawDetail || '실제 실행 상태를 확인하면서 다음 단계를 진행하고 있습니다.'
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
      const adaptiveDetail = String(panel.dataset.moniProgressDetail || '').trim()
      const detail = liveProgress || visibleDetail(stage, adaptiveDetail)
      const meta = liveProgressDetail || (stage === 'normal'
        ? '실제 실행 기록이 생기면 현재 조회 단계를 약 2초 간격으로 갱신합니다.'
        : '실제 실행 기록 기준으로 현재 상태를 계속 확인하고 있습니다.')

      const detailText = detail ? `현재 단계 · ${detail}` : ''
      const metaText = meta ? `진행 현황 · ${meta}` : ''
      if (mainLine && mainLine.textContent !== main) mainLine.textContent = main
      if (detailLine && detailLine.textContent !== detailText) detailLine.textContent = detailText
      if (metaLine && metaLine.textContent !== metaText) metaLine.textContent = metaText
      if (lines.hidden) lines.hidden = false
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

        // While the UI is THINKING, only RUNNING data is accepted as live progress.
        // This prevents the previous completed turn from briefly appearing as the current step.
        if (payload.run_status === 'RUNNING') {
          liveProgress = String(payload.progress || '').trim()
          liveProgressDetail = String(payload.progress_detail || '').trim()
          syncAll()
        }
      } catch {
        // The card must keep the local truthful fallback instead of going blank.
      } finally {
        statusRequestInFlight = false
      }
    }

    function syncPolling() {
      const active = thinkingPanels().length > 0
      if (active && statusTimer === null) {
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

      [data-moni-mobile-chat] [data-moni-progress-lines="true"] {
        display: grid !important;
        gap: 5px;
        margin-top: 7px;
      }

      [data-moni-mobile-chat] [data-moni-progress-lines="true"] ~ div {
        display: none !important;
      }

      [data-moni-mobile-chat] [data-moni-progress-main-line="true"] {
        color: #456b79;
        font-size: 11.5px;
        font-weight: 850;
        line-height: 1.45;
      }

      [data-moni-mobile-chat] [data-moni-progress-detail-line="true"] {
        color: #587b89;
        font-size: 10.8px;
        font-weight: 750;
        line-height: 1.55;
      }

      [data-moni-mobile-chat] [data-moni-progress-meta-line="true"] {
        color: #8a9da6;
        font-size: 10px;
        font-weight: 650;
        line-height: 1.5;
      }

      [data-moni-mobile-chat] [data-moni-thinking-stage="detail-1"] [data-moni-progress-detail-line="true"],
      [data-moni-mobile-chat] [data-moni-thinking-stage="detail-2"] [data-moni-progress-detail-line="true"] {
        color: #416c7e;
      }

      [data-moni-mobile-chat] [data-moni-thinking-stage="apology"] [data-moni-progress-main-line="true"],
      [data-moni-mobile-chat] [data-moni-thinking-stage="apology"] [data-moni-progress-detail-line="true"],
      [data-moni-mobile-chat] [data-moni-thinking-stage="apology"] [data-moni-progress-meta-line="true"] {
        color: #805f35;
      }
    `}</style>
  )
}
