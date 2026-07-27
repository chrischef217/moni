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

        // Top total banner: change label only. Amount and layout stay exactly as-is.
        const bannerLabel = copy.querySelector<HTMLElement>('.total-banner-label')
        if (bannerLabel) bannerLabel.textContent = totalLabel

        // Item table tax header.
        const lineHeaders = Array.from(copy.querySelectorAll<HTMLTableCellElement>('.statement-lines thead th'))
        const taxHeader = lineHeaders.find((cell) => ['세액', '부가세(VAT)'].includes((cell.textContent || '').trim()))
        if (taxHeader) taxHeader.textContent = '부가세(VAT)'

        // Footer labels and values. No styles, dimensions, classes or layout are modified.
        first[2].textContent = supplyLabel
        first[3].textContent = formatAmountWithCurrency(supply, currency)
        first[4].textContent = '부가세(VAT)'
        first[5].textContent = formatAmountWithCurrency(vat, currency)
        second[0].textContent = totalLabel
        second[1].textContent = formatAmountWithCurrency(total, currency)
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
