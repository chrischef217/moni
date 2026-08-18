'use client'

import { useLayoutEffect } from 'react'

function pathOf(input: RequestInfo | URL) {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  try { return new URL(raw, window.location.href).pathname } catch { return raw }
}

export default function MoniMobileRawCardRouteGuard() {
  useLayoutEffect(() => {
    const originalFetch = window.fetch.bind(window)
    const wrappedFetch: typeof window.fetch = (input, init) => {
      const method = String(init?.method || (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')).toUpperCase()
      if (method === 'GET' && pathOf(input) === '/api/moni/mobile-actions') {
        const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
        const url = new URL(raw, window.location.href)
        return originalFetch(`/api/moni/mobile-raw-card${url.search}`, init)
      }
      return originalFetch(input, init)
    }
    window.fetch = wrappedFetch
    return () => { if (window.fetch === wrappedFetch) window.fetch = originalFetch }
  }, [])
  return null
}
