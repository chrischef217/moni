import type { Metadata } from 'next'
import RawMaterialLedgerPrintController from '@/components/RawMaterialLedgerPrintController'
import MonthlyProductionRequirementPrintController from '@/components/MonthlyProductionRequirementPrintController'
import MonthlyProductionRequirementSafetyGuard from '@/components/MonthlyProductionRequirementSafetyGuard'
import MonthlyProductionPurchaseBudgetController from '@/components/MonthlyProductionPurchaseBudgetController'
import RawMaterialUnitPriceController from '@/components/RawMaterialUnitPriceController'
import RawMaterialTypeFilterController from '@/components/RawMaterialTypeFilterController'
import GlobalMoniSidebarController from '@/components/GlobalMoniSidebarController'
import GlobalSidebarLayoutController from '@/components/GlobalSidebarLayoutController'
import ProductionCompletionMetadataController from '@/components/ProductionCompletionMetadataController'
import SalesManagementMenuController from '@/components/SalesManagementMenuController'
import SalesTargetsMenuController from '@/components/SalesTargetsMenuController'
import FinancialControlMenuController from '@/components/FinancialControlMenuController'
import WorkOrderGramController from '@/components/WorkOrderGramController'
import SidebarPinToggleVisualFix from '@/components/SidebarPinToggleVisualFix'
import MonthlyProductionCalendarDayStyleController from '@/components/MonthlyProductionCalendarDayStyleController'
import MonthlyPlanToWorkOrderController from '@/components/MonthlyPlanToWorkOrderController'
import ProductionDashboardController from '@/components/ProductionDashboardController'
import ProductionGlassThemeController from '@/components/ProductionGlassThemeController'
import LegacyGlassThemeController from '@/components/LegacyGlassThemeController'
import AppearanceSettingsMenuController from '@/components/AppearanceSettingsMenuController'
import MoniWeatherShell from '@/components/MoniWeatherShell'
import { getSessionFromCookies } from '@/lib/allowance/session'
import './globals.css'
import './moni-glass-tokens.css'
import './moni-weather-shell.css'
import './moni-weather-shell-interaction.css'
import './moni-glass-theme.css'
import './moni-production-glass.css'
import './moni-production-shell-fixes.css'
import './moni-business-glass.css'
import './moni-final-glass-pass.css'
import './moni-control-tower-hierarchy.css'
import './moni-control-tower-reference.css'
import './moni-control-tower-readable.css'
import './monthly-production-calendar.css'
import './moni-monthly-calendar-glass-popover.css'
import './production-dashboard-motion.css'

export const metadata: Metadata = {
  title: 'Moni — 경영 고민? 모니한테 물어봐',
  description: '한국 소규모 식품 공장을 위한 AI 경영관리 도우미',
  icons: { icon: '/favicon.ico' },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSessionFromCookies()
  const showAdminChrome = session?.role === 'admin'

  return (
    <html lang="ko">
      <body className="antialiased">
        {showAdminChrome ? (
          <MoniWeatherShell>
            <RawMaterialLedgerPrintController />
            <MonthlyProductionRequirementPrintController />
            <MonthlyProductionRequirementSafetyGuard />
            <MonthlyProductionPurchaseBudgetController />
            <RawMaterialUnitPriceController />
            <RawMaterialTypeFilterController />
            <GlobalMoniSidebarController />
            <GlobalSidebarLayoutController />
            <ProductionGlassThemeController />
            <LegacyGlassThemeController />
            <AppearanceSettingsMenuController />
            <ProductionCompletionMetadataController />
            <SalesManagementMenuController />
            <SalesTargetsMenuController />
            <FinancialControlMenuController />
            <WorkOrderGramController />
            <SidebarPinToggleVisualFix />
            <MonthlyProductionCalendarDayStyleController />
            <MonthlyPlanToWorkOrderController />
            <ProductionDashboardController />
            {children}
          </MoniWeatherShell>
        ) : children}
      </body>
    </html>
  )
}
