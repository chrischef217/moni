'use client'

import { useEffect } from 'react'

function exactText(element: Element | null) {
  return (element?.textContent || '').replace(/\s+/g, ' ').trim()
}

export default function SalesStatementsUnifiedEnhancer() {
  useEffect(() => {
    let stopped = false

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
        if (statusIndex >= 0) headers[statusIndex].style.display = 'none'

        const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr'))
        let visibleDataRows = 0
        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>('td'))
          if (!cells.length) continue
          if (cells.length === 1) continue

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
          const managementCell = cells[cells.length - 1]
          for (const button of Array.from(managementCell.querySelectorAll<HTMLButtonElement>('button'))) {
            if (exactText(button) === '취소') button.textContent = '삭제'
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
    const timer = window.setInterval(apply, 500)

    return () => {
      stopped = true
      observer.disconnect()
      window.clearInterval(timer)
    }
  }, [])

  return <span data-sales-statements-unified-enhancer hidden />
}
