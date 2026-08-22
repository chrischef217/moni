'use client'

import { useEffect } from 'react'

type BalancePayload = {
  ok?: boolean
  currency?: string
  balances?: {
    previous?: number
    received?: number
    current?: number
  }
}

function amount(value: unknown, currency: string) {
  const parsed = Number(value ?? 0)
  const safe = Number.isFinite(parsed) ? parsed : 0
  if (currency === 'KRW') return Math.round(safe).toLocaleString('ko-KR')
  return safe.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function valueCellAfterLabel(table: HTMLElement, label: string) {
  const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>('th'))
  const header = headers.find((cell) => String(cell.textContent || '').trim() === label)
  if (!header) return null
  let sibling = header.nextElementSibling
  while (sibling) {
    if (sibling instanceof HTMLTableCellElement && sibling.tagName === 'TD') return sibling
    sibling = sibling.nextElementSibling
  }
  return null
}

function applyBalances(payload: BalancePayload) {
  const currency = String(payload.currency || 'KRW').toUpperCase()
  const previous = amount(payload.balances?.previous, currency)
  const received = amount(payload.balances?.received, currency)
  const current = amount(payload.balances?.current, currency)

  document.querySelectorAll<HTMLElement>('.statement-footer-table').forEach((table) => {
    const previousCell = valueCellAfterLabel(table, '전미수잔액')
    const receivedCell = valueCellAfterLabel(table, '입금액')
    const currentCell = valueCellAfterLabel(table, '총미수잔액')
    if (previousCell) previousCell.textContent = previous
    if (receivedCell) receivedCell.textContent = received
    if (currentCell) currentCell.textContent = current
  })
}

export default function ExportStatementBalanceEnhancer({ id }: { id: string }) {
  useEffect(() => {
    let cancelled = false
    let ready = false
    let pendingPrint = false
    const originalPrint = window.print.bind(window)

    window.print = () => {
      if (ready) originalPrint()
      else pendingPrint = true
    }

    const run = async () => {
      try {
        const response = await fetch(`/api/moni/export-statement-balances?id=${encodeURIComponent(id)}&_=${Date.now()}`, { cache: 'no-store' })
        const payload = await response.json() as BalancePayload
        if (!response.ok || !payload.ok || cancelled) return

        const sync = () => {
          if (cancelled) return
          applyBalances(payload)
          ready = true
          if (pendingPrint) {
            pendingPrint = false
            window.requestAnimationFrame(() => originalPrint())
          }
        }

        sync()
        window.setTimeout(sync, 80)
        window.setTimeout(sync, 240)
      } finally {
        if (!cancelled && !ready) {
          ready = true
          if (pendingPrint) {
            pendingPrint = false
            originalPrint()
          }
        }
      }
    }

    void run()
    return () => {
      cancelled = true
      window.print = originalPrint
    }
  }, [id])

  return null
}
