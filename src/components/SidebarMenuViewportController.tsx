'use client'

import { useEffect } from 'react'

const SIDEBAR_SELECTOR = '[data-moni-global-sidebar]'
const SHELL_SELECTOR = '[data-moni-app-shell]'
const STAGE_SELECTOR = '[data-moni-weather-stage]'
const CONTENT_SELECTOR = '[data-moni-app-content]'
const CATEGORY_BUTTON_SELECTOR = ':scope > button[data-moni-global-nav]'
const SUBMENU_SELECTOR = ':scope > div.grid'

function baseShellHeight() {
  if (window.innerWidth < 1024) return window.innerHeight
  return Math.max(620, Math.min(window.innerHeight * 0.9, 1100))
}

function numericStyle(value: string) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function outerHeight(element: HTMLElement) {
  const style = window.getComputedStyle(element)
  return element.getBoundingClientRect().height
    + numericStyle(style.marginTop)
    + numericStyle(style.marginBottom)
}

function isExpanded(button: HTMLButtonElement, submenu: HTMLElement) {
  return button.getAttribute('aria-expanded') === 'true'
    || submenu.classList.contains('grid-rows-[1fr]')
}

function measuredSidebarContentHeight(sidebar: HTMLElement, nav: HTMLElement, footer: HTMLElement) {
  const header = sidebar.firstElementChild instanceof HTMLElement ? sidebar.firstElementChild : null
  const navStyle = window.getComputedStyle(nav)
  let total = (header ? outerHeight(header) : 0)
    + outerHeight(footer)
    + numericStyle(navStyle.paddingTop)
    + numericStyle(navStyle.paddingBottom)

  for (const child of Array.from(nav.children)) {
    if (!(child instanceof HTMLElement)) continue
    const button = child.querySelector<HTMLButtonElement>(CATEGORY_BUTTON_SELECTOR)
    const submenu = child.querySelector<HTMLElement>(SUBMENU_SELECTOR)

    if (!button || !submenu) {
      total += outerHeight(child)
      continue
    }

    const rowStyle = window.getComputedStyle(child)
    total += outerHeight(button)
      + numericStyle(rowStyle.marginTop)
      + numericStyle(rowStyle.marginBottom)

    if (isExpanded(button, submenu)) {
      const clip = submenu.firstElementChild instanceof HTMLElement ? submenu.firstElementChild : null
      const submenuContent = clip?.firstElementChild instanceof HTMLElement ? clip.firstElementChild : clip
      total += Math.max(
        submenu.scrollHeight,
        clip?.scrollHeight ?? 0,
        submenuContent?.scrollHeight ?? 0,
      )
    }
  }

  return Math.ceil(total + 8)
}

function normalizeSalesCategory(nav: HTMLElement) {
  const categoryButton = nav.querySelector<HTMLButtonElement>('[data-sales-management-category]')
  const categoryIcon = nav.querySelector<HTMLElement>('[data-sales-management-icon]')
  if (!categoryButton) return

  categoryButton.className = 'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-semibold transition text-slate-200 hover:bg-slate-800/80 hover:text-white'
  categoryButton.style.removeProperty('background')
  categoryButton.style.removeProperty('background-color')
  categoryButton.style.removeProperty('color')

  if (categoryIcon) {
    categoryIcon.className = 'flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800'
    categoryIcon.style.removeProperty('background')
    categoryIcon.style.removeProperty('background-color')
    categoryIcon.style.removeProperty('color')
  }
}

export default function SidebarMenuViewportController() {
  useEffect(() => {
    let frame: number | null = null
    let mutationObserver: MutationObserver | null = null
    let resizeObserver: ResizeObserver | null = null
    const delayedTimers = new Set<number>()

    const apply = () => {
      frame = null
      const sidebar = document.querySelector<HTMLElement>(SIDEBAR_SELECTOR)
      const shell = document.querySelector<HTMLElement>(SHELL_SELECTOR)
      const stage = document.querySelector<HTMLElement>(STAGE_SELECTOR)
      const content = document.querySelector<HTMLElement>(CONTENT_SELECTOR)
      const nav = sidebar?.querySelector<HTMLElement>('nav') ?? null
      const footer = sidebar?.lastElementChild instanceof HTMLElement ? sidebar.lastElementChild : null
      if (!sidebar || !shell || !stage || !content || !nav || !footer) return

      normalizeSalesCategory(nav)

      const baseHeight = Math.ceil(baseShellHeight())
      const measuredHeight = measuredSidebarContentHeight(sidebar, nav, footer)
      const targetHeight = Math.max(baseHeight, measuredHeight)
      const needsOuterScroll = targetHeight > window.innerHeight - 24

      sidebar.style.setProperty('min-height', `${targetHeight}px`, 'important')
      shell.style.setProperty('height', `${targetHeight}px`, 'important')
      shell.style.setProperty('min-height', `${targetHeight}px`, 'important')
      shell.style.setProperty('max-height', 'none', 'important')
      content.style.setProperty('height', `${targetHeight}px`, 'important')
      content.style.setProperty('min-height', `${targetHeight}px`, 'important')

      if (needsOuterScroll) {
        stage.style.setProperty('overflow-x', 'hidden', 'important')
        stage.style.setProperty('overflow-y', 'auto', 'important')
        stage.style.setProperty('place-items', 'start center', 'important')
        stage.style.setProperty('padding', '20px 0', 'important')
        stage.style.setProperty('overscroll-behavior', 'contain', 'important')
      } else {
        stage.style.removeProperty('overscroll-behavior')
      }

      shell.setAttribute('data-moni-sidebar-expanded-height', String(targetHeight))
      sidebar.setAttribute('data-moni-sidebar-content-height', String(targetHeight))
    }

    const schedule = () => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(apply)
    }

    const scheduleThroughTransition = () => {
      schedule()
      for (const delay of [70, 170, 320, 480]) {
        const timer = window.setTimeout(() => {
          delayedTimers.delete(timer)
          schedule()
        }, delay)
        delayedTimers.add(timer)
      }
    }

    mutationObserver = new MutationObserver((mutations) => {
      const relevant = mutations.some((mutation) => {
        if (mutation.type === 'childList') return true
        if (mutation.type !== 'attributes') return false
        return mutation.attributeName === 'class' || mutation.attributeName === 'aria-expanded'
      })
      if (relevant) scheduleThroughTransition()
    })
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'aria-expanded'],
    })

    const sidebar = document.querySelector<HTMLElement>(SIDEBAR_SELECTOR)
    const nav = sidebar?.querySelector<HTMLElement>('nav') ?? null
    const footer = sidebar?.lastElementChild instanceof HTMLElement ? sidebar.lastElementChild : null
    if (sidebar && nav && footer) {
      resizeObserver = new ResizeObserver(scheduleThroughTransition)
      resizeObserver.observe(sidebar)
      resizeObserver.observe(nav)
      resizeObserver.observe(footer)
    }

    document.addEventListener('click', scheduleThroughTransition, true)
    window.addEventListener('resize', scheduleThroughTransition)
    scheduleThroughTransition()

    return () => {
      mutationObserver?.disconnect()
      resizeObserver?.disconnect()
      if (frame !== null) window.cancelAnimationFrame(frame)
      for (const timer of delayedTimers) window.clearTimeout(timer)
      delayedTimers.clear()
      document.removeEventListener('click', scheduleThroughTransition, true)
      window.removeEventListener('resize', scheduleThroughTransition)
    }
  }, [])

  return null
}
