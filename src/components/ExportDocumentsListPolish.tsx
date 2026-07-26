'use client'

import { useEffect } from 'react'

function normalizedText(element: Element | null) {
  return (element?.textContent || '').replace(/\s+/g, ' ').trim()
}

export default function ExportDocumentsListPolish() {
  useEffect(() => {
    const root = document.querySelector('main')
    if (!root) return

    const tagRows = () => {
      const rows = Array.from(root.querySelectorAll<HTMLTableRowElement>('tbody tr'))
      for (const row of rows) {
        const cells = row.querySelectorAll<HTMLTableCellElement>('td')
        if (cells.length < 9) continue

        const statusCell = cells[7]
        const status = statusCell.querySelector<HTMLElement>('span')
        if (status) status.dataset.exportDocumentStatus = 'true'

        const managementCell = cells[8]
        const controls = managementCell.querySelector<HTMLElement>('div')
        if (!controls) continue
        controls.dataset.exportDocumentActions = 'true'

        for (const button of Array.from(controls.querySelectorAll<HTMLButtonElement>('button'))) {
          const label = normalizedText(button)
          delete button.dataset.exportDocumentAction
          if (label === 'Invoice') button.dataset.exportDocumentAction = 'invoice'
          else if (label === 'Packing') button.dataset.exportDocumentAction = 'packing'
          else if (label === 'PDF/인쇄') button.dataset.exportDocumentAction = 'pdf'
          else if (label === '출고확정' || label === '출고취소') button.dataset.exportDocumentAction = 'shipment'
          else if (label === '수정') button.dataset.exportDocumentAction = 'edit'
          else if (label === '삭제') button.dataset.exportDocumentAction = 'delete'
        }
      }
    }

    tagRows()
    const observer = new MutationObserver(tagRows)
    observer.observe(root, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  return <>
    <span data-export-document-list-polish hidden />
    <style jsx global>{`
      body:has([data-export-document-list-polish]) main table th:nth-child(8),
      body:has([data-export-document-list-polish]) main table td:nth-child(8) {
        width: 104px !important;
        min-width: 104px !important;
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
        text-align: center !important;
      }

      body:has([data-export-document-list-polish]) [data-export-document-actions='true'] {
        display: grid !important;
        grid-template-columns: repeat(3, max-content) !important;
        grid-template-rows: repeat(2, auto) !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 8px !important;
      }

      body:has([data-export-document-list-polish]) [data-export-document-actions='true'] button {
        min-width: 0 !important;
        margin: 0 !important;
        white-space: nowrap !important;
        word-break: keep-all !important;
      }

      body:has([data-export-document-list-polish]) [data-export-document-action='invoice'] {
        grid-column: 1 !important;
        grid-row: 1 !important;
      }

      body:has([data-export-document-list-polish]) [data-export-document-action='packing'] {
        grid-column: 2 !important;
        grid-row: 1 !important;
      }

      body:has([data-export-document-list-polish]) [data-export-document-action='pdf'] {
        grid-column: 3 !important;
        grid-row: 1 !important;
        color: #ffffff !important;
      }

      body:has([data-export-document-list-polish]) [data-export-document-action='pdf'] * {
        color: #ffffff !important;
      }

      body:has([data-export-document-list-polish]) [data-export-document-action='shipment'] {
        grid-column: 1 !important;
        grid-row: 2 !important;
      }

      body:has([data-export-document-list-polish]) [data-export-document-action='edit'] {
        grid-column: 2 !important;
        grid-row: 2 !important;
      }

      body:has([data-export-document-list-polish]) [data-export-document-action='delete'] {
        grid-column: 3 !important;
        grid-row: 2 !important;
      }
    `}</style>
  </>
}
