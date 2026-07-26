'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import GlobalMoniSidebarController from '@/components/GlobalMoniSidebarController'

/**
 * The legacy admin surface lives at `/?legacy=1`.
 * Moving between `/` and `/?legacy=1` changes only the query string, so a
 * controller keyed only by pathname can keep stale layout state. Remount the
 * sidebar controller whenever either pathname or search params change.
 */
export default function GlobalMoniSidebarRouteBoundary() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const routeKey = `${pathname}?${searchParams.toString()}`

  return <GlobalMoniSidebarController key={routeKey} />
}
