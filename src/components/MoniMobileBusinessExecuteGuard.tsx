'use client'

import { useLayoutEffect } from 'react'

function pathOf(input: RequestInfo | URL) {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  try { return new URL(raw, window.location.href).pathname } catch { return raw }
}

export default function MoniMobileBusinessExecuteGuard() {
  useLayoutEffect(() => {
    const originalFetch = window.fetch.bind(window)
    const wrappedFetch: typeof window.fetch = (input, init) => {
      if (pathOf(input) === '/api/moni/mobile-business-actions' && typeof init?.body === 'string') {
        try {
          const body = JSON.parse(init.body)
          if (body?.command === 'execute') return originalFetch('/api/moni/mobile-business-execute', init)
        } catch { /* normal route handles malformed body */ }
      }
      return originalFetch(input, init)
    }
    window.fetch = wrappedFetch
    return () => { if (window.fetch === wrappedFetch) window.fetch = originalFetch }
  }, [])
  return null
}
