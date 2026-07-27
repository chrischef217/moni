'use client'

import { useEffect } from 'react'

type CompanyProfile = {
  bank_name?: string | null
  bank_account_holder?: string | null
  bank_account_number?: string | null
}

function cellText(row: HTMLTableRowElement | undefined, index: number) {
  return row?.cells?.[index]?.textContent?.trim() || '-'
}

function makeCell(tag: 'th' | 'td', value: string, className = '') {
  const cell = document.createElement(tag)
  cell.textContent = value
  if (className) cell.className = className
  return cell
}

function applyLayout(table: HTMLTableElement, profile: CompanyProfile) {
  if (table.dataset.paymentAccountLayout === '1') return

  const oldRows = Array.from(table.tBodies[0]?.rows || [])
  if (oldRows.length < 5) return

  const saleDate = cellText(oldRows[0], 1)
  const clientName = cellText(oldRows[1], 1)
  const address = cellText(oldRows[2], 1)
  const phone = cellText(oldRows[3], 1)
  const bankName = String(profile.bank_name || '국민은행').trim()
  const accountHolder = String(profile.bank_account_holder || '배순애(두배식품)').trim()
  const accountNumber = String(profile.bank_account_number || '678537-01-004949').trim()

  const colgroup = table.querySelector('colgroup') || document.createElement('colgroup')
  colgroup.replaceChildren()
  ;['buyer-label-a', 'buyer-value-a', 'buyer-label-b', 'buyer-value-b'].forEach((className) => {
    const col = document.createElement('col')
    col.className = className
    colgroup.appendChild(col)
  })
  if (!colgroup.parentElement) table.prepend(colgroup)

  const tbody = table.tBodies[0] || table.createTBody()
  tbody.replaceChildren()

  const firstRow = document.createElement('tr')
  firstRow.className = 'buyer-summary-row'
  firstRow.append(
    makeCell('th', '일자'),
    makeCell('td', saleDate, 'single-line'),
    makeCell('th', '거래처'),
    makeCell('td', clientName, 'single-line'),
  )

  const addressRow = document.createElement('tr')
  addressRow.className = 'address-row'
  const addressValue = makeCell('td', address, 'address-cell')
  addressValue.colSpan = 3
  addressRow.append(makeCell('th', '주소'), addressValue)

  const phoneRow = document.createElement('tr')
  const phoneValue = makeCell('td', phone, 'single-line')
  phoneValue.colSpan = 3
  phoneRow.append(makeCell('th', '전화번호'), phoneValue)

  const accountRow = document.createElement('tr')
  accountRow.className = 'payment-account-row'
  const accountValue = makeCell(
    'td',
    `${bankName} | 예금주: ${accountHolder} | 계좌번호: ${accountNumber}`,
    'payment-account-cell',
  )
  accountValue.colSpan = 3
  accountRow.append(makeCell('th', '입금 계좌'), accountValue)

  tbody.append(firstRow, addressRow, phoneRow, accountRow)
  table.dataset.paymentAccountLayout = '1'
}

export default function ExportStatementPaymentAccountEnhancer() {
  useEffect(() => {
    let stopped = false
    let observer: MutationObserver | null = null
    let profile: CompanyProfile = {}

    const apply = () => {
      if (stopped) return
      document
        .querySelectorAll<HTMLTableElement>('.statement-print-root .korean-statement-copy .buyer-table')
        .forEach((table) => applyLayout(table, profile))
    }

    const start = () => {
      if (stopped) return
      apply()
      observer = new MutationObserver(apply)
      observer.observe(document.body, { childList: true, subtree: true })
    }

    fetch(`/api/moni/company-profile?_=${Date.now()}`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload) => {
        if (stopped) return
        if (payload?.ok && payload.profile) profile = payload.profile as CompanyProfile
        start()
      })
      .catch(start)

    return () => {
      stopped = true
      observer?.disconnect()
    }
  }, [])

  return <style jsx global>{`
    .statement-print-root .buyer-table col.buyer-label-a { width: 13mm !important; }
    .statement-print-root .buyer-table col.buyer-value-a { width: 26mm !important; }
    .statement-print-root .buyer-table col.buyer-label-b { width: 14mm !important; }
    .statement-print-root .buyer-table col.buyer-value-b { width: 51mm !important; }

    .statement-print-root .buyer-table .buyer-summary-row th,
    .statement-print-root .buyer-table .buyer-summary-row td {
      height: 5.6mm !important;
    }

    .statement-print-root .buyer-table .payment-account-row th,
    .statement-print-root .buyer-table .payment-account-row td {
      height: 5.6mm !important;
      border-top: 1px solid #2942ef !important;
      border-bottom: 1px solid #2942ef !important;
    }

    .statement-print-root .buyer-table .payment-account-row th {
      border-left: 1px solid #2942ef !important;
      text-align: center !important;
      padding-left: 0.3mm !important;
      padding-right: 0.3mm !important;
    }

    .statement-print-root .buyer-table .payment-account-row td {
      border-right: 1px solid #2942ef !important;
    }

    .statement-print-root .buyer-table .payment-account-cell {
      font-size: 10.5px !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: clip !important;
      padding-left: 0.8mm !important;
      padding-right: 0.4mm !important;
    }

    .statement-print-root .korean-statement-a4 > .korean-statement-copy:last-child .buyer-table .payment-account-row th,
    .statement-print-root .korean-statement-a4 > .korean-statement-copy:last-child .buyer-table .payment-account-row td {
      border-color: #d62828 !important;
    }
  `}</style>
}
