'use client'

import { useEffect } from 'react'

const SIDEBAR_SELECTOR = '[data-moni-global-sidebar]'
const MOTION_DURATION_MS = 165
const MOTION_EASING = 'cubic-bezier(0.2, 0.86, 0.25, 1)'

export default function SidebarSubmenuMotionController() {
  useEffect(() => {
    let observer: MutationObserver | null = null
    let frame = 0
    let sidebar: HTMLElement | null = null
    let nav: HTMLElement | null = null
    let previousPositions = new Map<HTMLElement, number>()
    const running = new Map<HTMLElement, Animation>()
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const categoryRows = () => {
      if (!nav) return [] as HTMLElement[]
      return Array.from(nav.children).filter((node): node is HTMLElement => node instanceof HTMLElement)
    }

    const snapshot = () => {
      const next = new Map<HTMLElement, number>()
      for (const row of categoryRows()) next.set(row, row.getBoundingClientRect().top)
      previousPositions = next
    }

    const animateLayoutShift = () => {
      frame = 0
      const rows = categoryRows()
      if (!rows.length) return

      const nextPositions = new Map<HTMLElement, number>()
      for (const row of rows) nextPositions.set(row, row.getBoundingClientRect().top)

      if (!reduceMotion && previousPositions.size) {
        for (const row of rows) {
          const previousTop = previousPositions.get(row)
          const nextTop = nextPositions.get(row)
          if (previousTop === undefined || nextTop === undefined) continue

          const deltaY = previousTop - nextTop
          if (Math.abs(deltaY) < 0.75) continue

          running.get(row)?.cancel()
          const animation = row.animate(
            [
              { transform: `translate3d(0, ${deltaY}px, 0)` },
              { transform: 'translate3d(0, 0, 0)' },
            ],
            {
              duration: MOTION_DURATION_MS,
              easing: MOTION_EASING,
              fill: 'both',
            },
          )
          running.set(row, animation)
          animation.onfinish = () => {
            animation.cancel()
            running.delete(row)
          }
          animation.oncancel = () => running.delete(row)
        }
      }

      previousPositions = nextPositions
    }

    const scheduleAnimation = () => {
      if (frame) return
      frame = window.requestAnimationFrame(animateLayoutShift)
    }

    const attach = () => {
      sidebar = document.querySelector<HTMLElement>(SIDEBAR_SELECTOR)
      nav = sidebar?.querySelector<HTMLElement>('nav') ?? null
      if (!sidebar || !nav) return false

      snapshot()
      observer = new MutationObserver((mutations) => {
        const submenuChanged = mutations.some((mutation) => {
          if (mutation.type !== 'attributes' || mutation.attributeName !== 'class') return false
          const target = mutation.target
          return target instanceof HTMLElement && (
            target.matches('nav > div > div.grid') ||
            target.closest('nav > div') !== null
          )
        })
        if (submenuChanged) scheduleAnimation()
      })
      observer.observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] })
      nav.addEventListener('scroll', snapshot, { passive: true })
      return true
    }

    if (!attach()) {
      const waitForSidebar = new MutationObserver(() => {
        if (!attach()) return
        waitForSidebar.disconnect()
      })
      waitForSidebar.observe(document.body, { childList: true, subtree: true })

      return () => {
        waitForSidebar.disconnect()
        observer?.disconnect()
        if (frame) window.cancelAnimationFrame(frame)
        for (const animation of running.values()) animation.cancel()
        nav?.removeEventListener('scroll', snapshot)
      }
    }

    const handleResize = () => {
      if (frame) window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        frame = 0
        snapshot()
      })
    }
    window.addEventListener('resize', handleResize, { passive: true })

    return () => {
      observer?.disconnect()
      if (frame) window.cancelAnimationFrame(frame)
      for (const animation of running.values()) animation.cancel()
      nav?.removeEventListener('scroll', snapshot)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  return null
}
