'use client'

import { useLayoutEffect } from 'react'

const USER_TURN_START_EVENT = 'moni:user-turn-start'
const NORMAL_HEARTBEAT_MS = '1320ms'

function forceFreshTurnPresentation(root: HTMLElement) {
  root.dataset.moniTurnResetPending = 'true'
  root.dataset.moniThinkingStage = 'normal'
  root.dataset.moniHeartbeatStage = 'normal'
  root.dataset.moniHeartbeatOvertime = 'false'
  root.style.setProperty('--moni-heartbeat-ms', NORMAL_HEARTBEAT_MS)

  root.querySelectorAll<HTMLElement>('div[role="status"]').forEach((panel) => {
    if (!(panel.textContent || '').includes('MONI가 확인 중')) return
    panel.dataset.moniThinkingStage = 'normal'
    delete panel.dataset.moniProgressMain
    delete panel.dataset.moniProgressDetail
  })

  const character = root.querySelector<HTMLElement>('.moni-mobile-character')
  if (character) {
    character.dataset.moniCharacterStage = 'normal'
    character.classList.remove('moni-thinking-spin', 'moni-heartbeat-character-hit')
    character.style.removeProperty('--moni-hop-x')
    character.style.removeProperty('--moni-hop-y')
    character.style.removeProperty('--moni-hop-r')
    character.style.removeProperty('--moni-hop-scale')
  }

  root.querySelector<HTMLElement>('[data-moni-live-wave]')?.classList.remove('moni-heartbeat-hit')
}

export default function MoniMobileTurnBoundaryReset() {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-moni-mobile-chat]')
    if (!root) return

    let turnStartedAt = 0
    let releaseTimer: number | null = null
    let enforcing = false
    let normalizing = false

    const clearReleaseTimer = () => {
      if (releaseTimer !== null) {
        window.clearTimeout(releaseTimer)
        releaseTimer = null
      }
    }

    const enforceNormalWhileFresh = () => {
      if (!enforcing || normalizing || root.dataset.moniTurnResetPending !== 'true') return
      const staleRootStage = root.dataset.moniThinkingStage && root.dataset.moniThinkingStage !== 'normal'
      const staleHeartbeatStage = root.dataset.moniHeartbeatStage && root.dataset.moniHeartbeatStage !== 'normal'
      if (!staleRootStage && !staleHeartbeatStage) return

      normalizing = true
      forceFreshTurnPresentation(root)
      normalizing = false
    }

    const scheduleSafetyRelease = () => {
      clearReleaseTimer()
      releaseTimer = window.setTimeout(() => {
        releaseTimer = null
        // Normally MoniMobileTurnHygieneGuard releases the gate as soon as the new
        // request publishes a fresh normal-stage progress line. This fallback only
        // prevents a failed/aborted request from leaving the presentation gate stuck.
        if (Date.now() - turnStartedAt < 1200) return
        if (!root.querySelector('.moni-live-state-thinking')) {
          enforcing = false
          delete root.dataset.moniTurnResetPending
        }
      }, 1500)
    }

    const onUserTurnStart = () => {
      turnStartedAt = Date.now()
      enforcing = true
      forceFreshTurnPresentation(root)
      scheduleSafetyRelease()
    }

    const observer = new MutationObserver(() => {
      if (root.dataset.moniTurnResetPending !== 'true') {
        enforcing = false
        clearReleaseTimer()
        return
      }
      enforceNormalWhileFresh()
    })

    observer.observe(root, {
      attributes: true,
      attributeFilter: [
        'data-moni-thinking-stage',
        'data-moni-heartbeat-stage',
        'data-moni-turn-reset-pending',
      ],
      childList: true,
      subtree: true,
    })
    window.addEventListener(USER_TURN_START_EVENT, onUserTurnStart)

    return () => {
      observer.disconnect()
      clearReleaseTimer()
      window.removeEventListener(USER_TURN_START_EVENT, onUserTurnStart)
    }
  }, [])

  return null
}
