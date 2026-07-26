'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

const GlobalMoniAgent = dynamic(() => import('@/components/GlobalMoniAgent'), {
  ssr: false,
  loading: () => null,
})

const HIDDEN_AGENT_PATHS = new Set(['/production-daily', '/intelligence'])

export default function DeferredGlobalMoniAgent() {
  const pathname = usePathname()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 1200)
    return () => window.clearTimeout(timer)
  }, [])

  if (HIDDEN_AGENT_PATHS.has(pathname)) return null
  return ready ? <GlobalMoniAgent /> : null
}
