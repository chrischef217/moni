'use client'

import { useEffect, useRef } from 'react'

type ExportDocument = {
  id: string
  invoice_no: string
  status?: string | null
  sales_order_id?: string | null
  updated_at?: string | null
}

function text(element: Element | null) {
  return (element?.textContent || '').replace(/\s+/g, ' ').trim()
}

function jsonResponse(error: string, status = 500) {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

const SMALL_ACTIONS = new Set(['Invoice', 'Packing', '수정', '삭제'])
const LARGE_ACTIONS = new Set(['PDF/인쇄', '거래명세표 인쇄'])
const SMALL_BUTTON_WIDTH = 64
const LARGE_BUTTON_WIDTH = 92
const BUTTON_HEIGHT = 38
const BUTTON_GAP = 6
const CONTROL_WIDTH = (SMALL_BUTTON_WIDTH * 2) + LARGE_BUTTON_WIDTH + (BUTTON_GAP * 2)

const COLUMN_WIDTHS: Record<string, string> = {
  Date: '10%',
  'Invoice No.': '16%',
  'Packing List No.': '17%',
  Consignee: '10%',
  Country: '9%',
  CTN: '5%',
  Amount: '12%',
  관리: '21%',
}

function applyButtonSize(button: HTMLButtonElement) {
  const label = text(button)
  button.style.height = `${BUTTON_HEIGHT}px`
  button.style.paddingLeft = '6px'
  button.style.paddingRight = '6px'
  button.style.whiteSpace = 'nowrap'
  button.style.boxSizing = 'border-box'
  button.style.fontSize = '12px'
  button.style.lineHeight = '1'

  if (SMALL_ACTIONS.has(label)) {
    button.style.width = `${SMALL_BUTTON_WIDTH}px`
  } else if (LARGE_ACTIONS.has(label)) {
    button.style.width = `${LARGE_BUTTON_WIDTH}px`
  }
}

function applyTableLayout(table: HTMLTableElement, headers: HTMLTableCellElement[], statusIndex: number, managementIndex: number) {
  table.style.width = '100%'
  table.style.minWidth = '0px'
  table.style.tableLayout = 'fixed'

  const scrollHost = table.parentElement
  if (scrollHost) {
    scrollHost.style.overflowX = 'hidden'
    scrollHost.style.width = '100%'
  }

  headers.forEach((header, index) => {
    const label = text(header)
    header.style.boxSizing = 'border-box'
    header.style.paddingLeft = index === managementIndex ? '4px' : '8px'
    header.style.paddingRight = index === managementIndex ? '4px' : '8px'
    header.style.overflow = 'hidden'
    header.style.textOverflow = 'ellipsis'
    header.style.whiteSpace = 'nowrap'
    if (COLUMN_WIDTHS[label]) header.style.width = COLUMN_WIDTHS[label]
    if (index === statusIndex) header.style.display = 'none'
  })

  for (const row of Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr'))) {
    const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>('td'))
    cells.forEach((cell, index) => {
      cell.style.boxSizing = 'border-box'
      cell.style.paddingLeft = index === managementIndex ? '4px' : '8px'
      cell.style.paddingRight = index === managementIndex ? '4px' : '8px'
      cell.style.overflow = index === managementIndex ? 'visible' : 'hidden'
      cell.style.textOverflow = index === managementIndex ? 'clip' : 'ellipsis'
      cell.style.whiteSpace = index === 3 || index === 4 ? 'normal' : 'nowrap'
      if (index === statusIndex) cell.style.display = 'none'
      const headerLabel = text(headers[index])
      if (COLUMN_WIDTHS[headerLabel]) cell.style.width = COLUMN_WIDTHS[headerLabel]
    })
  }
}

export default function ExportDocumentsAutoSalesBridge() {
  const openedEditRef = useRef(false)

  useEffect(() => {
    const originalFetch = window.fetch.bind(window)
    let disposed = false
    let documents: ExportDocument[] = []
    const syncedSignatures = new Set<string>()

    const syncSales = async (id: string, action: 'SYNC' | 'DELETE') => {
      const response = await originalFetch('/api/moni/export-sales-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      })
      const payload = await response.clone().json().catch(() => null)
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || '판매관리 거래명세표 동기화에 실패했습니다.')
      return payload as Record<string, unknown>
    }

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const method = String(init?.method || (typeof input !== 'string' && !(input instanceof URL) ? input.method : 'GET')).toUpperCase()
      const isExportDocuments = url.includes('/api/moni/export-documents') && !url.includes('/api/moni/export-documents-reopen')

      if (!isExportDocuments) return originalFetch(input, init)

      if (method === 'DELETE') {
        const parsed = new URL(url, window.location.origin)
        const id = parsed.searchParams.get('id') || ''
        if (!id) return originalFetch(input, init)
        try {
          await syncSales(id, 'DELETE')
        } catch (error) {
          return jsonResponse(error instanceof Error ? error.message : '연결된 거래명세표를 삭제하지 못했습니다.', 409)
        }
        const response = await originalFetch(input, init)
        if (!response.ok) {
          try { await syncSales(id, 'SYNC') } catch { /* best-effort rollback */ }
        }
        return response
      }

      let nextInit = init
      if ((method === 'POST' || method === 'PATCH') && typeof init?.body === 'string') {
        try {
          const body = JSON.parse(init.body || '{}') as Record<string, unknown>
          if (!body.action) {
            nextInit = { ...init, body: JSON.stringify({ ...body, status: 'GENERATED' }) }
          }
        } catch {
          // Preserve the original request if a non-JSON body ever reaches this path.
        }
      }

      const response = await originalFetch(input, nextInit)
      if (!response.ok || (method !== 'POST' && method !== 'PATCH')) return response

      const payload = await response.clone().json().catch(() => null)
      const id = String(payload?.document?.id || '')
      if (!id) return response

      try {
        await syncSales(id, 'SYNC')
      } catch (error) {
        return jsonResponse(
          `수출서류는 저장되었지만 판매관리 거래명세표 자동 동기화에 실패했습니다. ${error instanceof Error ? error.message : ''}`.trim(),
          500,
        )
      }
      return response
    }

    const findDocumentTable = () => {
      const tables = Array.from(document.querySelectorAll<HTMLTableElement>('main table'))
      return tables.find((table) => {
        const headers = Array.from(table.querySelectorAll('thead th')).map((cell) => text(cell))
        return headers.includes('Invoice No.') && headers.includes('Packing List No.')
      }) || null
    }

    const applyDom = () => {
      const table = findDocumentTable()
      if (!table) return

      const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>('thead th'))
      const statusIndex = headers.findIndex((cell) => text(cell) === '상태')
      const managementIndex = headers.findIndex((cell) => text(cell) === '관리')
      applyTableLayout(table, headers, statusIndex, managementIndex)

      const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr'))
      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>('td'))
        if (cells.length < 2) continue

        const invoiceNo = text(cells[1])
        const documentRow = documents.find((item) => item.invoice_no === invoiceNo)
        const managementCell = managementIndex >= 0 ? cells[managementIndex] : cells[cells.length - 1]
        const controls = managementCell?.querySelector<HTMLElement>('div')
        if (!controls) continue

        for (const button of Array.from(controls.querySelectorAll<HTMLButtonElement>('button'))) {
          const label = text(button)
          if (label === '출고확정' || label === '출고취소' || label === '출고확정/거래명세표 인쇄' || label === '거래명세표 생성/인쇄') {
            button.remove()
          }
        }

        if (documentRow?.sales_order_id && !controls.querySelector('[data-export-auto-statement="true"]')) {
          const button = document.createElement('button')
          button.type = 'button'
          button.dataset.exportAutoStatement = 'true'
          button.className = 'rounded-lg bg-[#315d75] px-2.5 py-2 text-xs font-black text-white'
          button.textContent = '거래명세표 인쇄'
          button.addEventListener('click', () => {
            window.open(`/sales-management/export/documents/${encodeURIComponent(documentRow.id)}/statement?auto=1`, '_blank')
          })
          controls.appendChild(button)
        }

        const desiredOrder = ['Invoice', 'Packing', 'PDF/인쇄', '수정', '삭제', '거래명세표 인쇄']
        const buttons = Array.from(controls.querySelectorAll<HTMLButtonElement>('button'))
        const desiredButtons = desiredOrder
          .map((label) => buttons.find((item) => text(item) === label))
          .filter((item): item is HTMLButtonElement => Boolean(item))
        const currentButtons = Array.from(controls.querySelectorAll<HTMLButtonElement>('button'))
        const sameOrder = desiredButtons.length === currentButtons.length && desiredButtons.every((button, index) => currentButtons[index] === button)
        if (!sameOrder) {
          for (const button of desiredButtons) controls.appendChild(button)
        }

        for (const button of desiredButtons) applyButtonSize(button)

        controls.style.display = 'grid'
        controls.style.gridTemplateColumns = `${SMALL_BUTTON_WIDTH}px ${SMALL_BUTTON_WIDTH}px ${LARGE_BUTTON_WIDTH}px`
        controls.style.width = `${CONTROL_WIDTH}px`
        controls.style.maxWidth = '100%'
        controls.style.marginLeft = 'auto'
        controls.style.marginRight = 'auto'
        controls.style.justifyContent = 'center'
        controls.style.alignItems = 'center'
        controls.style.gap = `${BUTTON_GAP}px`

        if (!openedEditRef.current) {
          const editId = new URLSearchParams(window.location.search).get('edit')
          if (editId && documentRow?.id === editId) {
            const editButton = Array.from(controls.querySelectorAll<HTMLButtonElement>('button')).find((button) => text(button) === '수정')
            if (editButton) {
              openedEditRef.current = true
              editButton.click()
              window.history.replaceState(window.history.state, '', window.location.pathname)
            }
          }
        }
      }
    }

    const loadDocuments = async () => {
      try {
        const response = await originalFetch(`/api/moni/export-documents?_=${Date.now()}`, { cache: 'no-store' })
        const payload = await response.json()
        if (!response.ok || !payload?.ok || !Array.isArray(payload.documents)) return
        documents = payload.documents as ExportDocument[]

        for (const row of documents) {
          const signature = `${row.id}:${row.updated_at || ''}:${row.sales_order_id || ''}`
          if (syncedSignatures.has(signature)) continue
          try {
            const synced = await syncSales(row.id, 'SYNC')
            if (synced.sales_order_id) row.sales_order_id = String(synced.sales_order_id)
            syncedSignatures.add(signature)
          } catch {
            // Explicit save/delete will surface a synchronization error to the user.
          }
        }
        if (!disposed) applyDom()
      } catch {
        // Export page remains usable even if the bridge cannot refresh metadata.
      }
    }

    void loadDocuments()
    const observer = new MutationObserver(applyDom)
    const root = document.querySelector('main') || document.body
    observer.observe(root, { childList: true, subtree: true })
    const interval = window.setInterval(() => { if (!disposed) void loadDocuments() }, 1500)

    return () => {
      disposed = true
      window.fetch = originalFetch
      observer.disconnect()
      window.clearInterval(interval)
    }
  }, [])

  return <span data-export-documents-auto-sales-bridge hidden />
}
