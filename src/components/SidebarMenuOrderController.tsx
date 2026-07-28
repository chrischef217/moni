'use client'

import { useEffect } from 'react'

const MENU_ORDERS: Record<string, string[]> = {
  수출관리: ['수출서류 관리', '수출처 관리', '수출품목 설정'],
  영업관리: ['영업 목표매출', '영업기회 파이프라인', '영업활동·상담기록', '고객사 및 담당자'],
}

function normalizedText(element: Element | null) {
  return (element?.textContent || '').replace(/\s+/g, ' ').trim()
}

function applyMenuOrder() {
  const sidebar = document.querySelector<HTMLElement>('[data-moni-global-sidebar]')
  if (!sidebar) return

  const categoryButtons = Array.from(
    sidebar.querySelectorAll<HTMLButtonElement>('nav > div > button[data-moni-global-nav]'),
  )

  for (const categoryButton of categoryButtons) {
    const categoryLabel = normalizedText(categoryButton.querySelector('span.flex-1'))
    const desiredOrder = MENU_ORDERS[categoryLabel]
    if (!desiredOrder) continue

    const categoryRoot = categoryButton.parentElement
    const submenu = categoryRoot?.querySelector<HTMLElement>(':scope > div > div > div')
    if (!submenu) continue

    const itemButtons = Array.from(submenu.children).filter(
      (element): element is HTMLButtonElement => element instanceof HTMLButtonElement,
    )
    const byLabel = new Map(itemButtons.map((button) => [normalizedText(button), button]))
    const orderedButtons = desiredOrder
      .map((label) => byLabel.get(label))
      .filter((button): button is HTMLButtonElement => Boolean(button))

    if (orderedButtons.length !== desiredOrder.length) continue

    const currentOrder = itemButtons.map((button) => normalizedText(button))
    const alreadyOrdered = desiredOrder.every((label, index) => currentOrder[index] === label)
    if (alreadyOrdered) continue

    for (const button of orderedButtons) submenu.appendChild(button)
  }
}

export default function SidebarMenuOrderController() {
  useEffect(() => {
    let frame: number | null = null

    const schedule = () => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(() => {
        frame = null
        applyMenuOrder()
      })
    }

    applyMenuOrder()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      if (frame !== null) window.cancelAnimationFrame(frame)
    }
  }, [])

  return null
}
