'use client'

import { useEffect, useRef, useState } from 'react'

function normalizedText(element: Element | null) {
  return (element?.textContent || '').replace(/\s+/g, ' ').trim()
}

function normalizedValue(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

type ExportDocument = {
  id: string
  invoice_no: string
  status: string
  sales_order_id?: string | null
}

type DialogState = {
  open: boolean
  kind: 'confirm' | 'error'
  title: string
  message: string
  details: string[]
  confirmText: string
}

const CLOSED_DIALOG: DialogState = {
  open: false,
  kind: 'confirm',
  title: '',
  message: '',
  details: [],
  confirmText: '확인',
}

export default function ExportDocumentsListPolish() {
  const [dialog, setDialog] = useState<DialogState>(CLOSED_DIALOG)
  const pendingActionRef = useRef<null | (() => void)>(null)

  const closeDialog = () => {
    pendingActionRef.current = null
    setDialog(CLOSED_DIALOG)
  }

  const runDialogAction = () => {
    const action = pendingActionRef.current
    pendingActionRef.current = null
    setDialog(CLOSED_DIALOG)
    action?.()
  }

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

    const showError = (message: string) => {
      pendingActionRef.current = null
      setDialog({
        open: true,
        kind: 'error',
        title: '처리하지 못했습니다',
        message,
        details: [],
        confirmText: '확인',
      })
    }

    const shipAndPrint = async (button: HTMLButtonElement, documentRow: ExportDocument) => {
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
        showError(error instanceof Error ? error.message : '출고확정 및 거래명세표 생성에 실패했습니다.')
        button.disabled = false
        button.textContent = originalText
      }
    }

    const requestShip = (button: HTMLButtonElement, documentRow: ExportDocument) => {
      pendingActionRef.current = () => { void shipAndPrint(button, documentRow) }
      setDialog({
        open: true,
        kind: 'confirm',
        title: '출고확정 및 거래명세표 인쇄',
        message: '출고를 확정하면 아래 작업이 한 번에 처리됩니다.',
        details: [
          '완제품 재고에서 출고 수량 자동 차감',
          '판매관리에 면세(VAT 0%) 판매건 자동 등록',
          '거래명세표 자동 생성 후 인쇄창 열기',
        ],
        confirmText: '출고확정 및 인쇄',
      })
    }

    const cancelShipment = async (button: HTMLButtonElement, documentRow: ExportDocument) => {
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
        showError(error instanceof Error ? error.message : '출고취소에 실패했습니다.')
        button.disabled = false
        button.textContent = originalText
      }
    }

    const requestCancel = (button: HTMLButtonElement, documentRow: ExportDocument) => {
      pendingActionRef.current = () => { void cancelShipment(button, documentRow) }
      setDialog({
        open: true,
        kind: 'confirm',
        title: '수출 출고취소',
        message: '출고를 취소하면 연결된 재고와 판매기록도 함께 되돌립니다.',
        details: [
          '수출 출고 차감분 재고 복원',
          '연결된 판매관리 판매건 취소',
          '실제 입금이 등록된 판매건은 안전을 위해 취소가 차단됩니다.',
        ],
        confirmText: '출고취소',
      })
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
        if (createFirst) requestShip(button, documentRow)
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
            if (documentRow) bindIntercept(button, (event) => { stopReactClick(event); requestShip(button, documentRow) })
          } else if (label === '출고취소') {
            button.dataset.exportDocumentAction = 'edit'
            button.dataset.exportShipmentCancel = 'true'
            if (documentRow) bindIntercept(button, (event) => { stopReactClick(event); requestCancel(button, documentRow) })
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
          documentsByInvoice.set(normalizedValue(documentRow.invoice_no), documentRow)
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
      pendingActionRef.current = null
    }
  }, [])

  return <>
    <span data-export-document-list-polish hidden />

    {dialog.open ? <div
      className="fixed inset-0 z-[1900] flex items-center justify-center p-4"
      style={{ background: 'rgba(12,31,44,.34)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}
      role="dialog"
      aria-modal="true"
      aria-label={dialog.title}
    >
      <div className="w-full max-w-[520px] overflow-hidden rounded-[26px] border border-[#cfe0e8] bg-white shadow-[0_28px_80px_rgba(28,63,82,.26)]">
        <div className="border-b border-[#dfebf0] px-6 py-5">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-black ${dialog.kind === 'error' ? 'bg-[#fff0f1] text-[#c2535c]' : 'bg-[#e9f8f2] text-[#16825d]'}`}>
              {dialog.kind === 'error' ? '!' : '✓'}
            </div>
            <div>
              <h3 className="text-[19px] font-black text-[#17384b]">{dialog.title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-[#6d8391]">{dialog.message}</p>
            </div>
          </div>
        </div>
        {dialog.details.length ? <div className="px-6 py-5">
          <div className="space-y-2.5 rounded-2xl border border-[#dce9ef] bg-[#f7fbfd] p-4">
            {dialog.details.map((detail) => <div key={detail} className="flex items-start gap-2.5 text-sm font-semibold leading-5 text-[#385568]">
              <span className="mt-[2px] text-[#16a977]">●</span>
              <span>{detail}</span>
            </div>)}
          </div>
        </div> : null}
        <div className="flex justify-end gap-2.5 border-t border-[#e4edf1] bg-[#fbfdfe] px-6 py-4">
          {dialog.kind === 'confirm' ? <button
            type="button"
            onClick={closeDialog}
            className="h-11 rounded-xl border border-[#cbdce5] bg-white px-5 text-sm font-black text-[#385568]"
          >취소</button> : null}
          <button
            type="button"
            onClick={dialog.kind === 'confirm' ? runDialogAction : closeDialog}
            className={`h-11 rounded-xl px-5 text-sm font-black ${dialog.kind === 'error' ? 'bg-[#315d75]' : 'bg-[#16b981]'}`}
            style={{ color: '#ffffff' }}
          >{dialog.confirmText}</button>
        </div>
      </div>
    </div> : null}

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
        grid-template-columns: repeat(12, minmax(0, 1fr)) !important;
        grid-template-rows: repeat(2, 34px) !important;
        column-gap: 4px !important;
        row-gap: 7px !important;
        align-items: stretch !important;
        justify-content: center !important;
        width: 304px !important;
        max-width: 304px !important;
        margin: 0 auto !important;
      }

      body:has([data-export-document-list-polish]) [data-export-document-actions='true'] button {
        width: 100% !important;
        min-width: 0 !important;
        max-width: none !important;
        height: 34px !important;
        min-height: 34px !important;
        margin: 0 !important;
        padding: 0 6px !important;
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
        grid-column: 1 / span 4 !important;
        grid-row: 1 !important;
      }

      body:has([data-export-document-list-polish]) [data-export-document-action='packing'] {
        grid-column: 5 / span 4 !important;
        grid-row: 1 !important;
      }

      body:has([data-export-document-list-polish]) [data-export-document-action='pdf'] {
        grid-column: 9 / span 4 !important;
        grid-row: 1 !important;
        color: #ffffff !important;
      }

      body:has([data-export-document-list-polish]) [data-export-document-action='pdf'] * {
        color: #ffffff !important;
      }

      body:has([data-export-document-list-polish]) [data-export-document-action='shipment'] {
        grid-column: 1 / span 6 !important;
        grid-row: 2 !important;
        padding-left: 5px !important;
        padding-right: 5px !important;
        font-size: 9.5px !important;
        letter-spacing: -0.04em !important;
        color: #ffffff !important;
      }

      body:has([data-export-document-list-polish]) [data-export-document-action='edit'] {
        grid-column: 7 / span 3 !important;
        grid-row: 2 !important;
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
        grid-column: 10 / span 3 !important;
        grid-row: 2 !important;
        padding-left: 4px !important;
        padding-right: 4px !important;
      }
    `}</style>
  </>
}
