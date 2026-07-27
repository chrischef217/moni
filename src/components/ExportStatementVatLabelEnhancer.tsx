'use client'

import { useEffect } from 'react'

function amountFromText(value: string) {
  const normalized = value.replace(/,/g, '').replace(/[^0-9.-]/g, '')
  const parsed = Number(normalized || 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatAmountWithCurrency(value: number, currencyLabel: string) {
  const amount = currencyLabel === '원'
    ? Math.round(value).toLocaleString('ko-KR')
    : value.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${amount}${currencyLabel}`
}

function setTextIfChanged(element: HTMLElement | null | undefined, next: string) {
  if (!element) return
  if ((element.textContent || '').trim() !== next) element.textContent = next
}

export default function ExportStatementVatLabelEnhancer() {
  useEffect(() => {
    let stopped = false

    const apply = () => {
      if (stopped) return

      const copies = Array.from(document.querySelectorAll<HTMLElement>('.statement-print-root .korean-statement-copy'))
      for (const copy of copies) {
        const footer = copy.querySelector<HTMLTableElement>('.statement-footer-table')
        const rows = footer ? Array.from(footer.querySelectorAll<HTMLTableRowElement>('tbody tr')) : []
        if (rows.length < 2) continue

        // Actual DOM cell counts:
        // row 1: 전미수잔액 | value(colSpan=3) | 합계 | value | 세액 | value = 6 cells
        // row 2: 총합계 | value | 입금액 | value | 총미수잔액 | value | 인수자 | value = 8 cells
        const first = Array.from(rows[0].children) as HTMLElement[]
        const second = Array.from(rows[1].children) as HTMLElement[]
        if (first.length < 6 || second.length < 8) continue

        const currency = copy.querySelector<HTMLElement>('.total-banner-currency')?.textContent?.trim() || '원'
        const supply = amountFromText(first[3]?.textContent || '')
        const total = amountFromText(second[1]?.textContent || '')
        const vat = Math.max(0, total - supply)
        const hasVat = vat > 0.000001

        const supplyLabel = hasVat ? '공급가액(VAT 별도)' : '공급가액'
        const totalLabel = hasVat ? '최종 결제금액(VAT 포함)' : '최종 결제금액(VAT 없음)'

        // Change text only. Layout sizing is controlled by the print stylesheet.
        setTextIfChanged(copy.querySelector<HTMLElement>('.total-banner-label'), totalLabel)

        const lineHeaders = Array.from(copy.querySelectorAll<HTMLTableCellElement>('.statement-lines thead th'))
        const taxHeader = lineHeaders.find((cell) => ['세액', '부가세(VAT)'].includes((cell.textContent || '').trim()))
        setTextIfChanged(taxHeader, '부가세(VAT)')

        setTextIfChanged(first[2], supplyLabel)
        setTextIfChanged(first[3], formatAmountWithCurrency(supply, currency))
        setTextIfChanged(first[4], '부가세')
        setTextIfChanged(first[5], formatAmountWithCurrency(vat, currency))
        setTextIfChanged(second[0], totalLabel)
        setTextIfChanged(second[1], formatAmountWithCurrency(total, currency))
      }
    }

    apply()
    const observer = new MutationObserver(apply)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      stopped = true
      observer.disconnect()
    }
  }, [])

  return null
}
