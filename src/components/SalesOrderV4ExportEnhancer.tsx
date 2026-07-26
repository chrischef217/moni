'use client'

import { useEffect } from 'react'

type SalesOrder = {
  statement_number: string
  source_type?: string | null
  source_reference?: string | null
  currency?: string | null
}

function exactText(element: Element | null) {
  return (element?.textContent || '').replace(/\s+/g, ' ').trim()
}

function formatMoney(value: unknown, currency: string) {
  const amount = Number(value ?? 0)
  const safe = Number.isFinite(amount) ? amount : 0
  if (currency === 'KRW') return `KRW ${Math.round(safe).toLocaleString('ko-KR')}`
  return `${currency} ${safe.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function SalesOrderV4ExportEnhancer() {
  useEffect(() => {
    let disposed = false
    let ordersByStatement = new Map<string, SalesOrder & Record<string, unknown>>()
    let lastMonth = ''

    const apply = () => {
      const main = document.querySelector<HTMLElement>('[data-business-management-shell] main')
      if (!main) return
      const rows = Array.from(main.querySelectorAll<HTMLTableRowElement>('tbody tr'))
      for (const row of rows) {
        const cells = row.querySelectorAll<HTMLTableCellElement>('td')
        if (cells.length < 11) continue
        const statementNumber = exactText(cells[2])
        const order = ordersByStatement.get(statementNumber)
        if (!order || String(order.source_type || '').toUpperCase() !== 'EXPORT' || !order.source_reference) continue

        row.dataset.exportSalesOrder = 'true'
        const currency = String(order.currency || 'KRW').toUpperCase()
        const values: Array<[number, unknown]> = [[5, order.supply_amount], [6, order.vat_amount], [7, order.total_amount]]
        for (const [index, value] of values) {
          const next = formatMoney(value, currency)
          if (cells[index].textContent !== next) cells[index].textContent = next
        }

        const output = Array.from(cells[10].querySelectorAll<HTMLButtonElement>('button')).find((button) => exactText(button) === '출력')
        if (output && output.dataset.exportStatementBound !== 'true') {
          output.dataset.exportStatementBound = 'true'
          output.addEventListener('click', (event) => {
            event.preventDefault()
            event.stopPropagation()
            event.stopImmediatePropagation()
            window.open(`/sales-management/export/documents/${encodeURIComponent(String(order.source_reference))}/statement?auto=1`, '_blank')
          }, { capture: true })
        }
      }
    }

    const load = async () => {
      const monthInput = document.querySelector<HTMLInputElement>('[data-business-management-shell] input[type="month"]')
      const month = monthInput?.value || new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7)
      if (!month || month === lastMonth && ordersByStatement.size) {
        apply()
        return
      }
      lastMonth = month
      try {
        const response = await fetch(`/api/moni/sales-orders-v4?month=${encodeURIComponent(month)}&_=${Date.now()}`, { cache: 'no-store' })
        const payload = await response.json()
        if (!response.ok || !payload.ok || !Array.isArray(payload.orders)) return
        ordersByStatement = new Map(payload.orders.map((order: SalesOrder & Record<string, unknown>) => [String(order.statement_number || ''), order]))
        if (!disposed) apply()
      } catch {
        // Core sales screen remains usable if the export enhancement cannot load.
      }
    }

    void load()
    const interval = window.setInterval(() => {
      if (disposed) return
      void load()
    }, 700)
    const observer = new MutationObserver(apply)
    const shell = document.querySelector('[data-business-management-shell]')
    if (shell) observer.observe(shell, { childList: true, subtree: true })

    return () => {
      disposed = true
      window.clearInterval(interval)
      observer.disconnect()
    }
  }, [])

  return <span data-sales-order-export-enhancer hidden />
}
