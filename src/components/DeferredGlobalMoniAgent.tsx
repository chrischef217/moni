'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'

const GlobalMoniAgent = dynamic(() => import('@/components/GlobalMoniAgent'), {
  ssr: false,
  loading: () => null,
})

export default function DeferredGlobalMoniAgent() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 1200)
    return () => window.clearTimeout(timer)
  }, [])

  return ready ? <GlobalMoniAgent /> : null
}
