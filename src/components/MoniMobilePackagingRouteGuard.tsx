'use client'

import { useLayoutEffect } from 'react'

function pathOf(input: RequestInfo | URL) {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  try { return new URL(raw, window.location.href).pathname } catch { return raw }
}

export default function MoniMobilePackagingRouteGuard() {
  useLayoutEffect(() => {
    const originalFetch = window.fetch.bind(window)
    const wrappedFetch: typeof window.fetch = async (input, init) => {
      if (pathOf(input) !== '/api/moni/mobile-business-actions') return originalFetch(input, init)
      const method = String(init?.method || (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')).toUpperCase()
      if (method === 'POST' && typeof init?.body === 'string') {
        try {
          const body = JSON.parse(init.body)
          if (body?.command === 'prepare' && body?.domain === 'packaging_inbound') return originalFetch('/api/moni/mobile-packaging-actions', init)
        } catch { /* normal route handles malformed body */ }
      }
      if (method !== 'GET') return originalFetch(input, init)
      const response = await originalFetch(input, init)
      if (!response.ok) return response
      const payload = await response.clone().json().catch(() => null) as any
      if (payload?.card?.domain !== 'packaging_inbound') return response
      const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const url = new URL(raw, window.location.href)
      return originalFetch(`/api/moni/mobile-packaging-actions${url.search}`, init)
    }
    window.fetch = wrappedFetch
    return () => { if (window.fetch === wrappedFetch) window.fetch = originalFetch }
  }, [])
  return null
}
