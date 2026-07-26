'use client'

import dynamic from 'next/dynamic'
import { usePathname, useSearchParams } from 'next/navigation'

const LegacyAdminRuntime = dynamic(() => import('@/components/LegacyAdminRuntime'), { ssr: false })
const MonthlyProductionRuntime = dynamic(() => import('@/components/MonthlyProductionRuntime'), { ssr: false })
const ProductionGlassThemeController = dynamic(() => import('@/components/ProductionGlassThemeController'), { ssr: false })
const LegacyGlassThemeController = dynamic(() => import('@/components/LegacyGlassThemeController'), { ssr: false })

export default function AdminRouteRuntime() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const legacyHome = pathname === '/' && searchParams.get('legacy') === '1'
  const monthlyProduction = pathname === '/monthly-production-plan'
  const productionDaily = pathname === '/production-daily'
  const productionSurface = legacyHome || monthlyProduction || productionDaily
  const legacyGlassSurface = legacyHome || pathname === '/audit' || pathname === '/settings/appearance'

  return (
    <>
      {legacyHome && <LegacyAdminRuntime />}
      {monthlyProduction && <MonthlyProductionRuntime />}
      {productionSurface && <ProductionGlassThemeController />}
      {legacyGlassSurface && <LegacyGlassThemeController />}
    </>
  )
}
