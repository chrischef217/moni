'use client'

import { useEffect, useRef } from 'react'

type ExportDocument = {
  id: string
  invoice_no: string
  status: string
  sales_order_id?: string | null
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

export default function ExportDocumentsAutoSalesBridge() {
  const openedEditRef = useRef(false)

  useEffect(() => {
    const originalFetch = window.fetch.bind(window)
    let disposed = false
    let documents: ExportDocument[] = []

    const syncSales = async (id: string, action: 'SYNC' | 'DELETE') => {
      const response = await originalFetch('/api/moni/export-sales-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      })
      const payload = await response.clone().json().catch(() => null)
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || '판매관리 거래명세표 동기화에 실패했습니다.')
      return payload
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

      if (method === 'PATCH' && typeof init?.body === 'string') {
        const body = JSON.parse(init.body || '{}') as Record<string, unknown>
        const action = String(body.action || '').toUpperCase()
        if (action === 'SHIP') {
          return originalFetch('/api/moni/export-shipment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: body.id, action: 'SHIP' }),
          })
        }
      }

      const response = await originalFetch(input, init)
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

    const loadDocuments = async () => {
      try {
        const response = await originalFetch(`/api/moni/export-documents?_=${Date.now()}`, { cache: 'no-store' })
        const payload = await response.json()
        if (!response.ok || !payload?.ok || !Array.isArray(payload.documents)) return
        documents = payload.documents as ExportDocument[]

        for (const row of documents) {
          if (!row.sales_order_id && row.status !== 'CANCELLED') {
            try { await syncSales(row.id, 'SYNC') } catch { /* surfaced on next explicit save */ }
          }
        }
        if (!disposed) applyDom()
      } catch {
        // Export page remains usable even if the bridge cannot refresh metadata.
      }
    }

    const applyDom = () => {
      const main = document.querySelector('main')
      if (!main) return
      const rows = Array.from(main.querySelectorAll<HTMLTableRowElement>('tbody tr'))
      for (const row of rows) {
        const cells = row.querySelectorAll<HTMLTableCellElement>('td')
        if (cells.length < 9) continue
        const invoiceNo = text(cells[1])
        const documentRow = documents.find((item) => item.invoice_no === invoiceNo)
        if (!documentRow?.sales_order_id) continue
        const controls = cells[8].querySelector<HTMLElement>('div')
        if (!controls || controls.querySelector('[data-export-auto-statement="true"]')) continue
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

      if (!openedEditRef.current) {
        const editId = new URLSearchParams(window.location.search).get('edit')
        if (editId) {
          const target = documents.find((item) => item.id === editId)
          if (target) {
            for (const row of rows) {
              const cells = row.querySelectorAll<HTMLTableCellElement>('td')
              if (cells.length < 9 || text(cells[1]) !== target.invoice_no) continue
              const editButton = Array.from(cells[8].querySelectorAll<HTMLButtonElement>('button')).find((button) => text(button) === '수정')
              if (editButton) {
                openedEditRef.current = true
                editButton.click()
                window.history.replaceState(window.history.state, '', window.location.pathname)
              }
              break
            }
          }
        }
      }
    }

    void loadDocuments()
    const observer = new MutationObserver(applyDom)
    const root = document.querySelector('main') || document.body
    observer.observe(root, { childList: true, subtree: true })
    const interval = window.setInterval(() => { if (!disposed) void loadDocuments() }, 1200)

    return () => {
      disposed = true
      window.fetch = originalFetch
      observer.disconnect()
      window.clearInterval(interval)
    }
  }, [])

  return <span data-export-documents-auto-sales-bridge hidden />
}
