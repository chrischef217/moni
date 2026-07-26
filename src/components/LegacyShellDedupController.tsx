'use client'

import { useLayoutEffect } from 'react'

function normalizeText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function findLegacyDashboardRoot(): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('div.flex.min-h-screen'))
  return (
    candidates.find((root) => {
      const sidebar = root.querySelector<HTMLElement>(':scope > aside')
      const mainColumn = root.querySelector<HTMLElement>(':scope > div.min-w-0.flex-1')
      if (!sidebar || !mainColumn) return false
      return Array.from(mainColumn.querySelectorAll<HTMLButtonElement>('button')).some(
        (button) => normalizeText(button.textContent) === '로그아웃',
      )
    }) ?? null
  )
}

function isAiChatView(mainColumn: HTMLElement): boolean {
  const contentMain = mainColumn.querySelector<HTMLElement>(':scope > main')
  if (!contentMain) return false
  return Array.from(contentMain.querySelectorAll<HTMLElement>('h1')).some(
    (heading) => normalizeText(heading.textContent) === 'AI 채팅',
  )
}

function hideWithPriority(element: HTMLElement | null) {
  if (!element) return
  element.style.setProperty('display', 'none', 'important')
}

function restoreDisplay(element: HTMLElement | null) {
  if (!element) return
  element.style.removeProperty('display')
}

function hideLegacyMobileComposer(root: HTMLElement, shouldHide: boolean) {
  const textarea = root.querySelector<HTMLTextAreaElement>('textarea[placeholder="모니에게 바로 질문..."]')
  const fixedDock = textarea?.closest<HTMLElement>('[class*="fixed"]') ?? null
  if (!fixedDock) return
  if (shouldHide) hideWithPriority(fixedDock)
  else restoreDisplay(fixedDock)
}

function applyLegacyShellDedup() {
  const root = findLegacyDashboardRoot()
  if (!root) return false

  root.dataset.moniLegacyDashboardRoot = 'true'

  const sidebar = root.querySelector<HTMLElement>(':scope > aside')
  const mainColumn = root.querySelector<HTMLElement>(':scope > div.min-w-0.flex-1')
  if (!mainColumn) return false

  const topbar = mainColumn.querySelector<HTMLElement>(':scope > div.sticky')
  const contentMain = mainColumn.querySelector<HTMLElement>(':scope > main')
  const aiChat = isAiChatView(mainColumn)

  if (sidebar) sidebar.dataset.moniLegacyInnerSidebar = 'true'
  if (topbar) topbar.dataset.moniLegacyInnerTopbar = 'true'
  if (contentMain) contentMain.dataset.moniLegacyInnerMain = 'true'

  // AI chat intentionally keeps the compact history rail and its account row.
  // Every other legacy surface must use only the global MONI navigation shell.
  if (aiChat) {
    restoreDisplay(sidebar)
    restoreDisplay(topbar)
    hideLegacyMobileComposer(root, false)
  } else {
    hideWithPriority(sidebar)
    hideWithPriority(topbar)
    hideLegacyMobileComposer(root, true)

    // Defensive cleanup in case the AI-chat layout controller had marked the
    // previous view before React switched to another legacy production view.
    document.body.classList.remove('moni-ai-chat-active')
  }

  mainColumn.style.setProperty('min-width', '0')
  mainColumn.style.setProperty('width', '100%')
  if (contentMain && !aiChat) {
    contentMain.style.setProperty('width', '100%')
    contentMain.style.setProperty('max-width', 'none')
  }

  return true
}

export default function LegacyShellDedupController() {
  useLayoutEffect(() => {
    let frame = 0
    let retryTimer: number | null = null
    let attempts = 0

    const schedule = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const applied = applyLegacyShellDedup()
        if (!applied && attempts < 30) {
          attempts += 1
          retryTimer = window.setTimeout(schedule, 80)
        }
      })
    }

    schedule()

    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('focus', schedule)
    window.addEventListener('popstate', schedule)

    return () => {
      window.cancelAnimationFrame(frame)
      if (retryTimer !== null) window.clearTimeout(retryTimer)
      observer.disconnect()
      window.removeEventListener('focus', schedule)
      window.removeEventListener('popstate', schedule)
    }
  }, [])

  return null
}
