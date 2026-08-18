'use client'

import { useLayoutEffect } from 'react'

function pathOf(input: RequestInfo | URL) {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  try { return new URL(raw, window.location.href).pathname } catch { return raw }
}

export default function MoniMobileBusinessCatalogGuard() {
  useLayoutEffect(() => {
    const originalFetch = window.fetch.bind(window)
    let allowedProductIds: Set<string> | null = null
    let loading: Promise<Set<string>> | null = null

    const loadAllowedProducts = async () => {
      if (allowedProductIds) return allowedProductIds
      if (!loading) loading = originalFetch('/api/moni/mobile-product-catalog', { cache: 'no-store' }).then(async (response) => {
        const payload = await response.json().catch(() => ({})) as { ok?: boolean; products?: Array<{ id?: string }> }
        const ids = new Set((payload.ok && Array.isArray(payload.products) ? payload.products : []).map((row) => String(row.id || '').trim()).filter(Boolean))
        allowedProductIds = ids
        return ids
      }).catch(() => new Set<string>())
      return loading
    }

    const wrappedFetch: typeof window.fetch = async (input, init) => {
      const method = String(init?.method || (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')).toUpperCase()
      if (method !== 'GET' || pathOf(input) !== '/api/moni/mobile-business-actions') return originalFetch(input, init)
      const response = await originalFetch(input, init)
      if (!response.ok) return response
      const payload = await response.clone().json().catch(() => null) as any
      if (!payload?.ok || !payload?.card?.options?.products) return response
      const ids = await loadAllowedProducts()
      if (!ids.size) return response
      payload.card.options.products = payload.card.options.products.filter((row: any) => ids.has(String(row?.id || '').trim()))
      return new Response(JSON.stringify(payload), { status: response.status, statusText: response.statusText, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
    }

    window.fetch = wrappedFetch
    void loadAllowedProducts()
    return () => { if (window.fetch === wrappedFetch) window.fetch = originalFetch }
  }, [])
  return null
}
