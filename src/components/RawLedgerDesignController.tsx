'use client'

import { useEffect } from 'react'

function normalizeText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function parseNumeric(value: unknown): number {
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Math.round(value))
}

function findLedgerSection(): HTMLElement | null {
  const app = document.querySelector<HTMLElement>("[data-moni-app-content][data-moni-production-view='raw-ledger']")
  if (!app) return null
  return Array.from(app.querySelectorAll<HTMLElement>('section')).find((section) => {
    const heading = section.querySelector<HTMLElement>('h2')
    return normalizeText(heading?.textContent) === '원료수불부'
  }) ?? null
}

function findLedgerTabs(section: HTMLElement): HTMLElement | null {
  const buttons = Array.from(section.querySelectorAll<HTMLButtonElement>('button'))
  const raw = buttons.find((button) => normalizeText(button.textContent) === '원재료 수불부')
  const packaging = buttons.find((button) => normalizeText(button.textContent) === '부재료 수불부')
  if (!raw || !packaging || raw.parentElement !== packaging.parentElement) return null
  return raw.parentElement as HTMLElement
}

function findDetailModal(): HTMLElement | null {
  const overlays = Array.from(document.querySelectorAll<HTMLElement>('div.fixed.inset-0'))
  return overlays.find((overlay) => {
    const title = normalizeText(overlay.querySelector('h3')?.textContent)
    if (!title.endsWith('수불 상세')) return false
    const descriptions = Array.from(overlay.querySelectorAll('p')).map((node) => normalizeText(node.textContent))
    return descriptions.includes('기간별 입고/소모 내역') || descriptions.includes('기간별 입고/출고 내역')
  }) ?? null
}

function findDetailTable(modal: HTMLElement): HTMLTableElement | null {
  return Array.from(modal.querySelectorAll<HTMLTableElement>('table')).find((table) => {
    const headers = Array.from(table.querySelectorAll('thead th')).map((cell) => normalizeText(cell.textContent))
    return headers.includes('누적잔량(g)') || headers.includes('잔량(ea)')
  }) ?? null
}

function decorateRows(table: HTMLTableElement) {
  for (const row of Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr'))) {
    row.dataset.moniLedgerDetailRow = 'true'
    const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>('td'))
    const typeCell = cells[1]
    if (!typeCell) continue
    const type = normalizeText(typeCell.textContent)
    if (type.includes('입고')) typeCell.dataset.moniLedgerKind = 'inbound'
    else if (type.includes('소모') || type.includes('출고')) typeCell.dataset.moniLedgerKind = 'outbound'
    else typeCell.dataset.moniLedgerKind = 'other'
  }
}

function ensureSummary(modal: HTMLElement, table: HTMLTableElement) {
  const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr'))
  const headers = Array.from(table.querySelectorAll('thead th')).map((cell) => normalizeText(cell.textContent))
  const isRaw = headers.includes('입고(g)') && headers.includes('소모(g)')
  const unit = isRaw ? 'g' : 'ea'
  const outboundLabel = isRaw ? '기간 총 소모' : '기간 총 출고'

  let inbound = 0
  let outbound = 0
  let endingBalance = 0

  rows.forEach((row, index) => {
    const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>('td'))
    inbound += parseNumeric(cells[3]?.textContent)
    outbound += parseNumeric(cells[4]?.textContent)
    if (index === rows.length - 1) endingBalance = parseNumeric(cells[5]?.textContent)
  })

  const key = `${unit}|${rows.length}|${inbound}|${outbound}|${endingBalance}`
  const tableWrap = table.parentElement as HTMLElement | null
  const bodyStack = tableWrap?.parentElement as HTMLElement | null
  if (!tableWrap || !bodyStack) return

  let summary = bodyStack.querySelector<HTMLElement>('[data-moni-ledger-detail-summary]')
  if (!summary) {
    summary = document.createElement('div')
    summary.dataset.moniLedgerDetailSummary = 'true'
    bodyStack.insertBefore(summary, tableWrap)
  }

  if (summary.dataset.summaryKey === key) return
  summary.dataset.summaryKey = key
  summary.innerHTML = `
    <div data-tone="inbound"><span>기간 총 입고</span><strong>${formatNumber(inbound)}${unit}</strong></div>
    <div data-tone="outbound"><span>${outboundLabel}</span><strong>${formatNumber(outbound)}${unit}</strong></div>
    <div data-tone="balance"><span>조회 종료 잔량</span><strong>${formatNumber(endingBalance)}${unit}</strong></div>
    <div data-tone="count"><span>거래 건수</span><strong>${formatNumber(rows.length)}건</strong></div>
  `
}

function decorateModal(modal: HTMLElement) {
  modal.dataset.moniLedgerDetailModal = 'true'
  const panel = modal.firstElementChild as HTMLElement | null
  if (!panel) return
  panel.dataset.moniLedgerDetailPanel = 'true'

  const header = panel.children[0] as HTMLElement | undefined
  const body = panel.children[1] as HTMLElement | undefined
  if (header) header.dataset.moniLedgerDetailHeader = 'true'
  if (body) body.dataset.moniLedgerDetailBody = 'true'

  const table = findDetailTable(modal)
  if (!table) return
  const tableWrap = table.parentElement as HTMLElement | null
  if (tableWrap) tableWrap.dataset.moniLedgerDetailTableWrap = 'true'

  const stack = tableWrap?.parentElement as HTMLElement | null
  const searchPanel = stack
    ? Array.from(stack.children).find((child) => {
        if (!(child instanceof HTMLElement)) return false
        const dateInputs = child.querySelectorAll('input[type="date"]')
        const hasSearch = Array.from(child.querySelectorAll('button')).some((button) => normalizeText(button.textContent) === '검색')
        return dateInputs.length >= 2 && hasSearch
      }) as HTMLElement | undefined
    : undefined
  if (searchPanel) searchPanel.dataset.moniLedgerDetailSearch = 'true'

  decorateRows(table)
  ensureSummary(modal, table)
}

export default function RawLedgerDesignController() {
  useEffect(() => {
    let frame = 0

    const apply = () => {
      const section = findLedgerSection()
      if (section) {
        section.dataset.moniLedgerSurface = 'true'
        const tabs = findLedgerTabs(section)
        if (tabs) tabs.dataset.moniLedgerTabs = 'true'
      }

      const modal = findDetailModal()
      document.body.classList.toggle('moni-ledger-detail-open', Boolean(modal))
      if (modal) decorateModal(modal)
    }

    const schedule = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(apply)
    }

    schedule()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('focus', schedule)

    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('focus', schedule)
      document.body.classList.remove('moni-ledger-detail-open')
    }
  }, [])

  return null
}
