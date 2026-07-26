'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

function textOf(element: Element | null | undefined) {
  return (element?.textContent || '').replace(/\s+/g, ' ').trim()
}

function findAiSurface(heading: HTMLElement, root: HTMLElement) {
  let node: HTMLElement | null = heading.parentElement
  while (node && node !== root) {
    const className = String(node.className || '')
    if (className.includes('rounded-[28px]') && className.includes('flex') && className.includes('flex-col')) return node
    node = node.parentElement
  }
  return null
}

export default function LegacyAiChatLayoutController() {
  const pathname = usePathname()

  useEffect(() => {
    const legacyHome = pathname === '/' && new URLSearchParams(window.location.search).get('legacy') === '1'
    if (!legacyHome) return

    let frame = 0
    let observer: MutationObserver | null = null
    let originalComposerParent: HTMLElement | null = null

    const clear = () => {
      document.body.classList.remove('moni-ai-chat-active')
      document.querySelectorAll<HTMLElement>('[data-moni-ai-chat-layout]').forEach((node) => delete node.dataset.moniAiChatLayout)
      document.querySelectorAll<HTMLElement>('[data-moni-ai-history-sidebar]').forEach((node) => delete node.dataset.moniAiHistorySidebar)
      document.querySelectorAll<HTMLElement>('[data-moni-ai-legacy-topbar]').forEach((node) => delete node.dataset.moniAiLegacyTopbar)
      document.querySelectorAll<HTMLElement>('[data-moni-ai-content-main]').forEach((node) => delete node.dataset.moniAiContentMain)
      document.querySelectorAll<HTMLElement>('[data-moni-ai-chat-surface]').forEach((node) => delete node.dataset.moniAiChatSurface)
      document.querySelectorAll<HTMLElement>('[data-moni-ai-active-preview]').forEach((node) => delete node.dataset.moniAiActivePreview)
      document.querySelectorAll<HTMLElement>('[data-moni-ai-history-intro]').forEach((node) => delete node.dataset.moniAiHistoryIntro)

      const composer = document.querySelector<HTMLElement>('[data-moni-ai-composer]')
      if (composer && originalComposerParent && composer.parentElement !== originalComposerParent) {
        originalComposerParent.appendChild(composer)
      }
      if (composer) delete composer.dataset.moniAiComposer
    }

    const apply = () => {
      const dashboardRoot = Array.from(document.querySelectorAll<HTMLElement>('div.flex.min-h-screen'))
        .find((element) => element.className.includes('bg-gray-900'))
      if (!dashboardRoot) return

      const aiHeading = Array.from(dashboardRoot.querySelectorAll<HTMLElement>('h1'))
        .find((element) => textOf(element) === 'AI 채팅')

      if (!aiHeading) {
        clear()
        return
      }

      document.body.classList.add('moni-ai-chat-active')
      dashboardRoot.dataset.moniAiChatLayout = 'true'

      const historySidebar = dashboardRoot.querySelector<HTMLElement>(':scope > aside')
      if (historySidebar) {
        historySidebar.dataset.moniAiHistorySidebar = 'true'
        const intro = historySidebar.firstElementChild as HTMLElement | null
        if (intro) intro.dataset.moniAiHistoryIntro = 'true'

        const activeLabel = Array.from(historySidebar.querySelectorAll<HTMLElement>('p'))
          .find((element) => textOf(element).toLowerCase() === 'active chat')
        const activePreview = activeLabel?.parentElement?.parentElement as HTMLElement | null
        if (activePreview) activePreview.dataset.moniAiActivePreview = 'true'
      }

      const mainColumn = dashboardRoot.querySelector<HTMLElement>(':scope > div.min-w-0.flex-1')
      const topbar = mainColumn?.querySelector<HTMLElement>(':scope > div.sticky') ?? null
      const contentMain = mainColumn?.querySelector<HTMLElement>(':scope > main') ?? null
      if (topbar) topbar.dataset.moniAiLegacyTopbar = 'true'
      if (contentMain) contentMain.dataset.moniAiContentMain = 'true'

      const surface = findAiSurface(aiHeading, dashboardRoot)
      if (surface) surface.dataset.moniAiChatSurface = 'true'

      const composerTextarea = historySidebar?.querySelector<HTMLTextAreaElement>('textarea[placeholder="모니에게 바로 질문..."]')
      const composerDock = composerTextarea?.closest<HTMLElement>('div.border-t') ?? null
      if (historySidebar && composerDock && surface) {
        if (!originalComposerParent) originalComposerParent = historySidebar
        composerDock.dataset.moniAiComposer = 'true'
        if (composerDock.parentElement !== surface) surface.appendChild(composerDock)
      }

      const globalSidebar = document.querySelector<HTMLElement>('[data-moni-global-sidebar]')
      const currentArea = globalSidebar ? Array.from(globalSidebar.querySelectorAll<HTMLElement>('div')).find((element) => textOf(element).startsWith('현재 영역:')) : null
      if (globalSidebar && currentArea && !textOf(currentArea).includes('AI 챗팅')) {
        const aiButton = Array.from(globalSidebar.querySelectorAll<HTMLButtonElement>('button[data-moni-global-nav]'))
          .find((button) => textOf(button).includes('AI 챗팅'))
        aiButton?.click()
      }
    }

    const schedule = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(apply)
    }

    schedule()
    observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('popstate', schedule)
    window.addEventListener('resize', schedule)

    return () => {
      window.cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('popstate', schedule)
      window.removeEventListener('resize', schedule)
      clear()
    }
  }, [pathname])

  return null
}
