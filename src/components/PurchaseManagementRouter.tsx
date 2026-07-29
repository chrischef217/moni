'use client'

import { useEffect, useState } from 'react'
import PurchaseManagementModule from '@/components/PurchaseManagementModule'
import PurchaseReceiptManagementModule from '@/components/PurchaseReceiptManagementModule'
import type { ReceiptView } from '@/components/purchase-receipts/types'

function currentView(fallback: string): ReceiptView {
  if (typeof window === 'undefined') return fallback === 'purchases' || fallback === 'payables' ? fallback : 'suppliers'
  const value = new URLSearchParams(window.location.search).get('view')
  return value === 'purchases' || value === 'payables' ? value : 'suppliers'
}

export default function PurchaseManagementRouter({ initialView }: { initialView: string }) {
  const [view, setView] = useState<ReceiptView>(() => currentView(initialView))

  useEffect(() => {
    const sync = () => setView(currentView(initialView))
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [initialView])

  const navigate = (next: ReceiptView) => {
    const url = `/business-management?tab=purchase&view=${next}`
    window.history.pushState(window.history.state, '', url)
    setView(next)
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))
  }

  if (view === 'purchases') return <PurchaseReceiptManagementModule onNavigate={navigate} />
  return <PurchaseManagementModule key={`legacy-purchase-${view}`} initialView={view} />
}
