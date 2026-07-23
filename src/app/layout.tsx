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
import WorkOrderGramController from '@/components/WorkOrderGramController'
import SidebarPinToggleVisualFix from '@/components/SidebarPinToggleVisualFix'
import MonthlyProductionCalendarDayStyleController from '@/components/MonthlyProductionCalendarDayStyleController'
import MonthlyPlanToWorkOrderController from '@/components/MonthlyPlanToWorkOrderController'
import ProductionDashboardController from '@/components/ProductionDashboardController'
import './globals.css'
import './monthly-production-calendar.css'
import './production-dashboard-motion.css'

export const metadata: Metadata = {
  title: 'Moni — 경영 고민? 모니한테 물어봐',
  description: '한국 소규모 식품 공장을 위한 AI 경영관리 도우미',
  icons: { icon: '/favicon.ico' },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body className="antialiased">
        <RawMaterialLedgerPrintController />
        <MonthlyProductionRequirementPrintController />
        <MonthlyProductionRequirementSafetyGuard />
        <MonthlyProductionPurchaseBudgetController />
        <RawMaterialUnitPriceController />
        <RawMaterialTypeFilterController />
        <GlobalMoniSidebarController />
        <GlobalSidebarLayoutController />
        <ProductionCompletionMetadataController />
        <SalesManagementMenuController />
        <WorkOrderGramController />
        <SidebarPinToggleVisualFix />
        <MonthlyProductionCalendarDayStyleController />
        <MonthlyPlanToWorkOrderController />
        <ProductionDashboardController />
        {children}
      </body>
    </html>
  )
}
