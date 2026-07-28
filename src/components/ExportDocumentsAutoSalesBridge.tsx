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

function applyButtonSize(button: HTMLButtonElement) {
  const label = text(button)
  button.style.height = '42px'
  button.style.paddingLeft = '10px'
  button.style.paddingRight = '10px'
  button.style.whiteSpace = 'nowrap'
  button.style.boxSizing = 'border-box'

  if (SMALL_ACTIONS.has(label)) {
    button.style.width = '84px'
  } else if (LARGE_ACTIONS.has(label)) {
    button.style.width = '120px'
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
      if (statusIndex >= 0) headers[statusIndex].style.display = 'none'

      const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr'))
      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>('td'))
        if (cells.length < 2) continue
        if (statusIndex >= 0 && cells[statusIndex]) cells[statusIndex].style.display = 'none'

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
        controls.style.gridTemplateColumns = '84px 84px 120px'
        controls.style.justifyContent = 'center'
        controls.style.alignItems = 'center'
        controls.style.gap = '6px'

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
