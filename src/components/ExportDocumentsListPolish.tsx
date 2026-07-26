'use client'

import { useEffect } from 'react'

function normalizedText(element: Element | null) {
  return (element?.textContent || '').replace(/\s+/g, ' ').trim()
}

type ExportDocument = {
  id: string
  invoice_no: string
  status: string
  sales_order_id?: string | null
}

export default function ExportDocumentsListPolish() {
  useEffect(() => {
    const root = document.querySelector('main')
    if (!root) return

    let disposed = false
    const documentsByInvoice = new Map<string, ExportDocument>()

    const stopReactClick = (event: Event) => {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
    }

    const shipAndPrint = async (button: HTMLButtonElement, documentRow: ExportDocument) => {
      if (!window.confirm('출고확정하면 완제품 재고에서 자동 차감되고 판매관리에 VAT 0% 판매건이 생성됩니다. 이어서 거래명세표를 인쇄하시겠습니까?')) return
      const printWindow = window.open('', '_blank')
      const originalText = button.textContent
      button.disabled = true
      button.textContent = '처리중...'
      try {
        const response = await fetch('/api/moni/export-shipment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: documentRow.id, action: 'SHIP' }),
        })
        const payload = await response.json()
        if (!response.ok || !payload.ok) throw new Error(payload.error || '출고확정 및 거래명세표 생성에 실패했습니다.')
        const url = `/sales-management/export/documents/${encodeURIComponent(documentRow.id)}/statement?auto=1`
        if (printWindow) printWindow.location.href = url
        else window.open(url, '_blank')
        window.setTimeout(() => window.location.reload(), 450)
      } catch (error) {
        printWindow?.close()
        window.alert(error instanceof Error ? error.message : '출고확정 및 거래명세표 생성에 실패했습니다.')
        button.disabled = false
        button.textContent = originalText
      }
    }

    const cancelShipment = async (button: HTMLButtonElement, documentRow: ExportDocument) => {
      if (!window.confirm('출고를 취소하면 수출 재고 차감분이 복원되고 연결된 판매건도 취소됩니다. 진행하시겠습니까?')) return
      const originalText = button.textContent
      button.disabled = true
      button.textContent = '취소중...'
      try {
        const response = await fetch('/api/moni/export-shipment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: documentRow.id, action: 'CANCEL' }),
        })
        const payload = await response.json()
        if (!response.ok || !payload.ok) throw new Error(payload.error || '출고취소에 실패했습니다.')
        window.location.reload()
      } catch (error) {
        window.alert(error instanceof Error ? error.message : '출고취소에 실패했습니다.')
        button.disabled = false
        button.textContent = originalText
      }
    }

    const bindIntercept = (button: HTMLButtonElement, handler: (event: Event) => void) => {
      if (button.dataset.exportSalesBound === 'true') return
      button.dataset.exportSalesBound = 'true'
      button.addEventListener('click', handler, { capture: true })
    }

    const addStatementButton = (controls: HTMLElement, documentRow: ExportDocument, createFirst: boolean) => {
      if (controls.querySelector('[data-export-statement-button="true"]')) return
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.exportStatementButton = 'true'
      button.dataset.exportDocumentAction = 'shipment'
      button.className = 'rounded-lg bg-[#315d75] px-2.5 py-2 text-xs font-black text-white'
      button.textContent = createFirst ? '거래명세표 생성/인쇄' : '거래명세표 인쇄'
      button.addEventListener('click', (event) => {
        stopReactClick(event)
        if (createFirst) void shipAndPrint(button, documentRow)
        else window.open(`/sales-management/export/documents/${encodeURIComponent(documentRow.id)}/statement?auto=1`, '_blank')
      }, { capture: true })
      controls.appendChild(button)
    }

    const tagRows = () => {
      const rows = Array.from(root.querySelectorAll<HTMLTableRowElement>('tbody tr'))
      for (const row of rows) {
        const cells = row.querySelectorAll<HTMLTableCellElement>('td')
        if (cells.length < 9) continue

        const statusCell = cells[7]
        const status = statusCell.querySelector<HTMLElement>('span')
        if (status) status.dataset.exportDocumentStatus = 'true'

        const invoiceNo = normalizedText(cells[1])
        const documentRow = documentsByInvoice.get(invoiceNo)
        const managementCell = cells[8]
        const controls = managementCell.querySelector<HTMLElement>('div')
        if (!controls) continue
        controls.dataset.exportDocumentActions = 'true'

        for (const button of Array.from(controls.querySelectorAll<HTMLButtonElement>('button'))) {
          let label = normalizedText(button)
          if (button.dataset.exportStatementButton !== 'true') delete button.dataset.exportDocumentAction

          if (label === '출고확정') {
            button.textContent = '출고확정/거래명세표 인쇄'
            label = '출고확정/거래명세표 인쇄'
          }

          if (label === 'Invoice') button.dataset.exportDocumentAction = 'invoice'
          else if (label === 'Packing') button.dataset.exportDocumentAction = 'packing'
          else if (label === 'PDF/인쇄') button.dataset.exportDocumentAction = 'pdf'
          else if (label === '출고확정/거래명세표 인쇄') {
            button.dataset.exportDocumentAction = 'shipment'
            if (documentRow) bindIntercept(button, (event) => { stopReactClick(event); void shipAndPrint(button, documentRow) })
          } else if (label === '출고취소') {
            button.dataset.exportDocumentAction = 'edit'
            button.dataset.exportShipmentCancel = 'true'
            if (documentRow) bindIntercept(button, (event) => { stopReactClick(event); void cancelShipment(button, documentRow) })
          } else if (label === '수정') button.dataset.exportDocumentAction = 'edit'
          else if (label === '삭제') button.dataset.exportDocumentAction = 'delete'
        }

        if (documentRow?.status === 'SHIPPED') addStatementButton(controls, documentRow, !documentRow.sales_order_id)
        if (documentRow?.status === 'CANCELLED' && documentRow.sales_order_id) addStatementButton(controls, documentRow, false)
      }
    }

    const loadDocuments = async () => {
      try {
        const response = await fetch(`/api/moni/export-documents?_=${Date.now()}`, { cache: 'no-store' })
        const payload = await response.json()
        if (!response.ok || !payload.ok || !Array.isArray(payload.documents)) return
        documentsByInvoice.clear()
        for (const documentRow of payload.documents as ExportDocument[]) {
          documentsByInvoice.set(normalizedText({ textContent: documentRow.invoice_no } as Element), documentRow)
        }
        if (!disposed) tagRows()
      } catch {
        // The underlying export page still works even when enhancement metadata cannot be loaded.
      }
    }

    tagRows()
    void loadDocuments()
    const observer = new MutationObserver(tagRows)
    observer.observe(root, { childList: true, subtree: true })
    return () => {
      disposed = true
      observer.disconnect()
    }
  }, [])

  return <>
    <span data-export-document-list-polish hidden />
    <style jsx global>{`
      body:has([data-export-document-list-polish]) main table {
        width: 100% !important;
        min-width: 0 !important;
      }

      body:has([data-export-document-list-polish]) main table th:nth-child(8),
      body:has([data-export-document-list-polish]) main table td:nth-child(8) {
        width: 96px !important;
        min-width: 96px !important;
        padding-left: 8px !important;
        padding-right: 8px !important;
        text-align: center !important;
        white-space: nowrap !important;
      }

      body:has([data-export-document-list-polish]) [data-export-document-status='true'] {
        display: inline-flex !important;
        width: auto !important;
        min-width: 76px !important;
        align-items: center !important;
        justify-content: center !important;
        white-space: nowrap !important;
        word-break: keep-all !important;
        overflow-wrap: normal !important;
        line-height: 1 !important;
      }

      body:has([data-export-document-list-polish]) main table th:nth-child(9),
      body:has([data-export-document-list-polish]) main table td:nth-child(9) {
        width: 310px !important;
        min-width: 310px !important;
        max-width: 310px !important;
        padding-left: 3px !important;
        padding-right: 3px !important;
        text-align: center !important;
      }

      body:has([data-export-document-list-polish]) [data-export-document-actions='true'] {
        display: grid !important;
        grid-template-columns: 188px 51px 51px !important;
        grid-template-rows: repeat(2, 34px) !important;
        align-items: stretch !important;
        justify-content: center !important;
        gap: 7px !important;
        width: 304px !important;
        max-width: 304px !important;
        margin: 0 auto !important;
      }

      body:has([data-export-document-list-polish]) [data-export-document-actions='true'] button {
        min-width: 0 !important;
        max-width: none !important;
        height: 34px !important;
        min-height: 34px !important;
        margin: 0 !important;
        padding: 0 7px !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        white-space: nowrap !important;
        word-break: keep-all !important;
        overflow: hidden !important;
        line-height: 1 !important;
        box-sizing: border-box !important;
      }

      body:has([data-export-document-list-polish]) [data-export-document-action='invoice'] {
        grid-column: 1 !important;
        grid-row: 1 !important;
        width: 92px !important;
        justify-self: start !important;
      }

      body:has([data-export-document-list-polish]) [data-export-document-action='packing'] {
        grid-column: 1 !important;
        grid-row: 1 !important;
        width: 92px !important;
        justify-self: center !important;
      }

      body:has([data-export-document-list-polish]) [data-export-document-action='pdf'] {
        grid-column: 1 / 4 !important;
        grid-row: 1 !important;
        width: 92px !important;
        justify-self: end !important;
        color: #ffffff !important;
      }

      body:has([data-export-document-list-polish]) [data-export-document-action='pdf'] * {
        color: #ffffff !important;
      }

      body:has([data-export-document-list-polish]) [data-export-document-action='shipment'] {
        grid-column: 1 !important;
        grid-row: 2 !important;
        width: 188px !important;
        font-size: 10px !important;
        letter-spacing: -0.035em !important;
        color: #ffffff !important;
      }

      body:has([data-export-document-list-polish]) [data-export-document-action='edit'] {
        grid-column: 2 !important;
        grid-row: 2 !important;
        width: 51px !important;
        padding-left: 4px !important;
        padding-right: 4px !important;
      }

      body:has([data-export-document-list-polish]) [data-export-shipment-cancel='true'] {
        border: 1px solid #efc0c4 !important;
        background: #fff7f7 !important;
        color: #b24c55 !important;
        font-size: 10px !important;
      }

      body:has([data-export-document-list-polish]) [data-export-document-action='delete'] {
        grid-column: 3 !important;
        grid-row: 2 !important;
        width: 51px !important;
        padding-left: 4px !important;
        padding-right: 4px !important;
      }
    `}</style>
  </>
}
