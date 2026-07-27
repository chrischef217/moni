'use client'

import { useEffect } from 'react'

function exactText(element: Element | null) {
  return (element?.textContent || '').replace(/\s+/g, ' ').trim()
}

function styleLightButton(button: HTMLButtonElement, tone: 'neutral' | 'blue' | 'red') {
  button.style.display = 'inline-flex'
  button.style.alignItems = 'center'
  button.style.justifyContent = 'center'
  button.style.borderWidth = '1px'
  button.style.borderStyle = 'solid'
  button.style.borderRadius = '10px'
  button.style.padding = '7px 12px'
  button.style.fontSize = '12px'
  button.style.fontWeight = '800'
  button.style.lineHeight = '1.2'
  button.style.textDecoration = 'none'
  button.style.whiteSpace = 'nowrap'
  button.style.opacity = button.disabled ? '0.45' : '1'

  if (tone === 'blue') {
    button.style.backgroundColor = '#eaf4ff'
    button.style.borderColor = '#8bbde8'
    button.style.color = '#135b8f'
    return
  }
  if (tone === 'red') {
    button.style.backgroundColor = '#fff1f0'
    button.style.borderColor = '#efaaa5'
    button.style.color = '#b42318'
    return
  }
  button.style.backgroundColor = '#ffffff'
  button.style.borderColor = '#b9cbd7'
  button.style.color = '#17384a'
}

function ensureUnpaidAnimationStyle() {
  if (document.getElementById('moni-unpaid-payment-style')) return
  const style = document.createElement('style')
  style.id = 'moni-unpaid-payment-style'
  style.textContent = `
    @keyframes moni-unpaid-payment-pulse {
      0%, 100% {
        background-color: #fff1f0;
        border-color: #e5484d;
        color: #b42318;
        box-shadow: 0 0 0 0 rgba(229, 72, 77, 0.18);
        transform: scale(1);
      }
      50% {
        background-color: #ffd9d6;
        border-color: #c81e1e;
        color: #8a1111;
        box-shadow: 0 0 0 5px rgba(229, 72, 77, 0.12);
        transform: scale(1.035);
      }
    }
    [data-moni-unpaid-payment='true'] {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      border: 1px solid #e5484d !important;
      border-radius: 10px !important;
      background: #fff1f0 !important;
      color: #b42318 !important;
      font-weight: 900 !important;
      animation: moni-unpaid-payment-pulse 1.05s ease-in-out infinite !important;
    }
    @media (prefers-reduced-motion: reduce) {
      [data-moni-unpaid-payment='true'] {
        animation: none !important;
        box-shadow: 0 0 0 3px rgba(229, 72, 77, 0.12) !important;
      }
    }
  `
  document.head.appendChild(style)
}

function stylePaymentStatus(button: HTMLButtonElement) {
  const label = exactText(button)
  if (label.startsWith('미입금')) {
    button.dataset.moniUnpaidPayment = 'true'
    return
  }

  delete button.dataset.moniUnpaidPayment
  button.style.animation = ''
}

export default function SalesStatementsUnifiedEnhancer() {
  useEffect(() => {
    let stopped = false
    ensureUnpaidAnimationStyle()

    const apply = () => {
      if (stopped) return
      const root = document.querySelector<HTMLElement>('[data-business-management-shell]')
      if (!root) return
      const main = root.querySelector<HTMLElement>('main')
      if (!main) return

      const pageTitle = Array.from(main.querySelectorAll<HTMLElement>('h1')).find((node) => exactText(node) === '판매 등록')
      if (pageTitle) pageTitle.textContent = '거래명세표'

      const headerDescription = Array.from(main.querySelectorAll<HTMLElement>('header p')).find((node) => exactText(node).startsWith('제품별 판매규격과 거래처 단가를 선택해 판매합니다.'))
      if (headerDescription) headerDescription.textContent = '판매를 등록하고 생성된 거래명세표를 한 화면에서 조회·출력·관리합니다.'

      const sectionTitle = Array.from(main.querySelectorAll<HTMLElement>('section h2')).find((node) => exactText(node) === '판매 내역')
      if (sectionTitle) sectionTitle.textContent = '명세표 출력 목록'

      const sectionDescription = sectionTitle?.parentElement?.querySelector<HTMLElement>('p')
      if (sectionDescription && exactText(sectionDescription).startsWith('실제 입금이 한 번이라도 등록되면')) {
        sectionDescription.textContent = '판매등록 시 거래명세표가 바로 생성됩니다. 일반 판매건은 여기서 수정·삭제하고, 수출 판매건은 원본 수출서류에서 수정합니다.'
      }

      const table = main.querySelector<HTMLTableElement>('section table')
      if (table) {
        const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>('thead th'))
        const statusIndex = headers.findIndex((cell) => exactText(cell) === '상태')
        const paymentIndex = headers.findIndex((cell) => exactText(cell) === '수금상태')
        if (statusIndex >= 0) headers[statusIndex].style.display = 'none'

        const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr'))
        let visibleDataRows = 0
        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>('td'))
          if (!cells.length || cells.length === 1) continue

          if (statusIndex >= 0 && cells[statusIndex]) {
            const status = exactText(cells[statusIndex])
            if (status.startsWith('취소')) {
              row.style.display = 'none'
              continue
            }
            cells[statusIndex].style.display = 'none'
          }

          row.style.display = ''
          visibleDataRows += 1

          if (paymentIndex >= 0 && cells[paymentIndex]) {
            const paymentButton = cells[paymentIndex].querySelector<HTMLButtonElement>('button')
            if (paymentButton) stylePaymentStatus(paymentButton)
          }

          const managementCell = cells[cells.length - 1]
          for (const button of Array.from(managementCell.querySelectorAll<HTMLButtonElement>('button'))) {
            const label = exactText(button)
            if (label === '취소') button.textContent = '삭제'
            if (label === '출력') styleLightButton(button, 'neutral')
            if (label === '수출서류 수정') styleLightButton(button, 'blue')
          }
        }

        let emptyRow = table.querySelector<HTMLTableRowElement>('tr[data-unified-empty-row]')
        if (visibleDataRows === 0 && rows.some((row) => row.querySelectorAll('td').length > 1)) {
          if (!emptyRow) {
            emptyRow = document.createElement('tr')
            emptyRow.dataset.unifiedEmptyRow = 'true'
            const cell = document.createElement('td')
            cell.colSpan = Math.max(1, headers.length - (statusIndex >= 0 ? 1 : 0))
            cell.className = 'px-5 py-14 text-center text-slate-500'
            cell.textContent = '조회 월에 등록된 판매가 없습니다.'
            emptyRow.appendChild(cell)
            table.querySelector('tbody')?.appendChild(emptyRow)
          }
          emptyRow.style.display = ''
        } else if (emptyRow) {
          emptyRow.style.display = 'none'
        }
      }

      const otherSaleModalTitle = Array.from(document.querySelectorAll<HTMLElement>('h2')).find((node) => {
        const label = exactText(node)
        return label === '기타 상품 판매' || label === '기타 상품 판매 수정'
      })
      const otherSaleModal = otherSaleModalTitle?.closest<HTMLElement>('div.fixed')
      if (otherSaleModal) {
        for (const button of Array.from(otherSaleModal.querySelectorAll<HTMLButtonElement>('button'))) {
          if (exactText(button) === '삭제') styleLightButton(button, 'red')
        }
      }

      const deleteModalTitle = Array.from(document.querySelectorAll<HTMLElement>('h2')).find((node) => exactText(node) === '판매 취소')
      if (deleteModalTitle) {
        deleteModalTitle.textContent = '거래명세표 삭제'
        const modal = deleteModalTitle.closest<HTMLElement>('div.fixed')
        if (modal) {
          const description = Array.from(modal.querySelectorAll<HTMLElement>('p')).find((node) => exactText(node).startsWith('취소 전 판매내용은'))
          if (description) description.textContent = '목록에서는 삭제되며 판매 취소 이력은 보존됩니다. 실제 입금이 있는 건은 삭제할 수 없습니다.'
          const labels = Array.from(modal.querySelectorAll<HTMLElement>('span'))
          const reasonLabel = labels.find((node) => exactText(node) === '취소 사유')
          if (reasonLabel) reasonLabel.textContent = '삭제 사유'
          const confirm = Array.from(modal.querySelectorAll<HTMLButtonElement>('button')).find((button) => exactText(button) === '판매 취소 확정')
          if (confirm) confirm.textContent = '삭제'
        }
      }
    }

    apply()
    const observer = new MutationObserver(apply)
    observer.observe(document.body, { childList: true, subtree: true })
    const timer = window.setInterval(apply, 400)

    return () => {
      stopped = true
      observer.disconnect()
      window.clearInterval(timer)
    }
  }, [])

  return <span data-sales-statements-unified-enhancer hidden />
}
