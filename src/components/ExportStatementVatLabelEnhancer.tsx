'use client'

import { useEffect } from 'react'

function amountFromText(value: string) {
  const normalized = value.replace(/,/g, '').replace(/[^0-9.-]/g, '')
  const parsed = Number(normalized || 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatVat(value: number, currencyLabel: string) {
  if (currencyLabel === '원') return Math.round(value).toLocaleString('ko-KR')
  return value.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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

        const first = Array.from(rows[0].children) as HTMLElement[]
        const second = Array.from(rows[1].children) as HTMLElement[]
        if (first.length < 8 || second.length < 8) continue

        const supply = amountFromText(first[5]?.textContent || '')
        const total = amountFromText(second[1]?.textContent || '')
        const vat = Math.max(0, total - supply)
        const hasVat = vat > 0.000001
        const currency = copy.querySelector<HTMLElement>('.total-banner-currency')?.textContent?.trim() || '원'

        const totalLabel = hasVat ? '최종 결제금액(VAT 포함)' : '최종 결제금액(VAT 없음)'
        const supplyLabel = hasVat ? '공급가액(VAT 별도)' : '공급가액'

        const bannerLabel = copy.querySelector<HTMLElement>('.total-banner-label')
        if (bannerLabel) bannerLabel.textContent = totalLabel

        const lineHeaders = Array.from(copy.querySelectorAll<HTMLTableCellElement>('.statement-lines thead th'))
        const taxHeader = lineHeaders.find((cell) => (cell.textContent || '').trim() === '세액')
        if (taxHeader) taxHeader.textContent = '부가세(VAT)'

        first[4].textContent = supplyLabel
        first[6].textContent = '부가세(VAT)'
        first[7].textContent = formatVat(vat, currency)
        second[0].textContent = totalLabel
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
