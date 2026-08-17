'use client'

import { useLayoutEffect } from 'react'

type ThinkingStage = 'normal' | 'grace' | 'detail-1' | 'detail-2' | 'apology'

function visibleDetail(stage: ThinkingStage | '', rawDetail: string) {
  if (stage === 'normal') return '질문의 범위와 필요한 데이터를 확인하고 있습니다.'
  if (stage === 'grace') return '확인된 내용을 정리하고 답변을 마무리하고 있습니다.'
  return rawDetail
}

export default function MoniMobileThinkingCopyFix() {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-moni-mobile-chat]')
    if (!root) return

    function syncPanel(panel: HTMLElement) {
      let lines = panel.querySelector<HTMLElement>(':scope > [data-moni-progress-lines]')
      if (!lines) {
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
      }

      const mainLine = lines.querySelector<HTMLElement>('[data-moni-progress-main-line]')
      const detailLine = lines.querySelector<HTMLElement>('[data-moni-progress-detail-line]')
      const main = String(panel.dataset.moniProgressMain || '').trim()
      const rawDetail = String(panel.dataset.moniProgressDetail || '').trim()
      const stage = String(panel.dataset.moniThinkingStage || '') as ThinkingStage | ''
      const detail = visibleDetail(stage, rawDetail)
      const detailText = detail ? `현재 진행 · ${detail}` : ''

      if (mainLine && mainLine.textContent !== main) mainLine.textContent = main
      if (detailLine && detailLine.textContent !== detailText) detailLine.textContent = detailText
      const shouldHide = !main && !detail
      if (lines.hidden !== shouldHide) lines.hidden = shouldHide
    }

    function syncAll() {
      root.querySelectorAll<HTMLElement>('[data-moni-adaptive-progress="true"]').forEach(syncPanel)
    }

    syncAll()
    const observer = new MutationObserver(syncAll)
    observer.observe(root, {
      attributes: true,
      attributeFilter: [
        'data-moni-adaptive-progress',
        'data-moni-progress-main',
        'data-moni-progress-detail',
        'data-moni-thinking-stage',
      ],
      childList: true,
      subtree: true,
    })

    return () => observer.disconnect()
  }, [])

  return (
    <style jsx global>{`
      [data-moni-mobile-chat] [data-moni-adaptive-progress="true"]::after {
        content: none !important;
        display: none !important;
      }

      [data-moni-mobile-chat] [data-moni-progress-lines="true"] {
        display: grid;
        gap: 4px;
        margin-top: 7px;
      }

      [data-moni-mobile-chat] [data-moni-progress-main-line="true"] {
        color: #4c7180;
        font-size: 11.5px;
        font-weight: 800;
        line-height: 1.45;
      }

      [data-moni-mobile-chat] [data-moni-progress-detail-line="true"] {
        color: #78909a;
        font-size: 10.5px;
        font-weight: 650;
        line-height: 1.55;
      }

      [data-moni-mobile-chat] [data-moni-thinking-stage="detail-1"] [data-moni-progress-detail-line="true"],
      [data-moni-mobile-chat] [data-moni-thinking-stage="detail-2"] [data-moni-progress-detail-line="true"] {
        color: #4f7080;
      }

      [data-moni-mobile-chat] [data-moni-thinking-stage="apology"] [data-moni-progress-main-line="true"],
      [data-moni-mobile-chat] [data-moni-thinking-stage="apology"] [data-moni-progress-detail-line="true"] {
        color: #805f35;
      }
    `}</style>
  )
}
