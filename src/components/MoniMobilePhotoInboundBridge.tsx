'use client'

import { useEffect } from 'react'
import { isRawMaterialPhotoInboundRequest } from '@/lib/moni/raw-material-photo-intent'

const MESSAGE_CACHE_KEY = 'moni-mobile-message-cache-v1'

function recentContext() {
  try {
    const rows = JSON.parse(window.localStorage.getItem(MESSAGE_CACHE_KEY) || '[]')
    if (!Array.isArray(rows)) return ''
    return rows.slice(-8).map((row: any) => String(row?.content || '')).join('\n').slice(0, 12000)
  } catch {
    return ''
  }
}

export default function MoniMobilePhotoInboundBridge() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window)
    const wrappedFetch: typeof window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const method = String(init?.method || 'GET').toUpperCase()
      if (!url.includes('/api/moni/agent-runtime') || method !== 'POST' || typeof init?.body !== 'string') {
        return originalFetch(input, init)
      }

      try {
        const body = JSON.parse(init.body) as Record<string, any>
        const attachmentIds = Array.isArray(body.attachment_ids) ? body.attachment_ids.filter(Boolean) : []
        if (!attachmentIds.length || !isRawMaterialPhotoInboundRequest(body.message, recentContext())) {
          return originalFetch(input, init)
        }
        return originalFetch('/api/moni/mobile-photo-raw-inbound', init)
      } catch {
        return originalFetch(input, init)
      }
    }
    window.fetch = wrappedFetch
    return () => {
      if (window.fetch === wrappedFetch) window.fetch = originalFetch
    }
  }, [])

  return null
}
